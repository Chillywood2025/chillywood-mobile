-- PRODUCT_CHANGE can announce a deferred replacement, not an effective purchase.
-- Preserve the receipt without re-binding transactions, granting earnings, or
-- moving terminal watermarks. A later independently verified purchase/snapshot
-- must establish actual replacement authority.
create function private.record_revenuecat_product_change_notice(
 p_provider_event_id text,p_raw_payload_hash text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb;
begin
 r:=public.reserve_revenuecat_webhook_ingress_event(p_provider_event_id,p_raw_payload_hash);
 return jsonb_build_object('status','ignored','reason','product_change_pending_effective_proof',
  'domain','missing','authorityGranted',false,'premiumGranted',false,'ignoredEvent',true,
  'duplicateEvent',coalesce((r->>'duplicateEvent')::boolean,false),
  'entitlementActive',false,'accessStateChanged',false,'financialAuthority',false);
end $$;
revoke all on function private.record_revenuecat_product_change_notice(text,text) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.process_revenuecat_app_store_event_atomic(p_provider_event_id text, p_event_type text, p_user_id uuid, p_provider_product_id text, p_environment text, p_occurred_at timestamp with time zone, p_expires_at timestamp with time zone, p_amount_minor integer, p_currency text, p_raw_payload_hash text, p_original_transaction_id text, p_input_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin

  if upper(trim(coalesce(p_event_type,'')))='PRODUCT_CHANGE' then
    return private.record_revenuecat_product_change_notice(p_provider_event_id,p_raw_payload_hash);
  end if;
  if upper(trim(coalesce(p_event_type,'')))='SUBSCRIPTION_PAUSED' then
    return private.record_revenuecat_scheduled_pause(p_provider_event_id,p_raw_payload_hash);
  end if;
  if upper(trim(coalesce(p_event_type,''))) in (
    'CANCELLATION','BILLING_ISSUE','EXPIRATION','REFUND','REVOCATION','SUBSCRIPTION_PAUSED'
  ) then
    return public."process_revenuecat_terminal_event_atomic"(
      'revenuecat_app_store',p_provider_event_id,p_event_type,p_user_id,p_provider_product_id,null,
      p_environment,case upper(trim(coalesce(p_event_type,'')))
        when 'REFUND' then 'revoked' when 'REVOCATION' then 'revoked'
        when 'SUBSCRIPTION_PAUSED' then 'revoked' when 'EXPIRATION' then 'expired'
        when 'CANCELLATION' then 'canceled' else 'pending' end,
      null,p_expires_at,p_occurred_at,p_raw_payload_hash,null,'app_store','ios',p_original_transaction_id
    );
  end if;
  return public."process_revenuecat_consumable_event_provider_internal"(
    p_provider_event_id,p_event_type,p_user_id,p_provider_product_id,p_environment,
    p_occurred_at,p_expires_at,p_amount_minor,p_currency,p_raw_payload_hash,
    p_original_transaction_id,'revenuecat_app_store','ios','app_store',
    'revenuecat_app_store_enabled',p_input_reason
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_revenuecat_app_store_event_atomic(p_provider_event_id text, p_event_type text, p_user_id uuid, p_provider_product_id text, p_environment text, p_occurred_at timestamp with time zone, p_expires_at timestamp with time zone, p_amount_minor integer, p_currency text, p_raw_payload_hash text, p_original_transaction_id text, p_input_reason text, p_purchase_occurred_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin

  if upper(trim(coalesce(p_event_type,'')))='PRODUCT_CHANGE' then
    return private.record_revenuecat_product_change_notice(p_provider_event_id,p_raw_payload_hash);
  end if;
  if upper(trim(coalesce(p_event_type,'')))='SUBSCRIPTION_PAUSED' then
    return private.record_revenuecat_scheduled_pause(p_provider_event_id,p_raw_payload_hash);
  end if;
  if upper(trim(coalesce(p_event_type,''))) in ('INITIAL_PURCHASE','NON_RENEWING_PURCHASE','RENEWAL','UNCANCELLATION','PRODUCT_CHANGE') then
    perform public.record_creator_money_purchase_time_internal('revenuecat_app_store',p_provider_event_id,p_user_id,
      p_provider_product_id,p_environment,p_raw_payload_hash,p_purchase_occurred_at);
  end if;
  return public.process_revenuecat_app_store_event_atomic(p_provider_event_id,p_event_type,p_user_id,p_provider_product_id,
    p_environment,p_occurred_at,p_expires_at,p_amount_minor,p_currency,p_raw_payload_hash,p_original_transaction_id,p_input_reason);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_revenuecat_google_play_event_atomic(p_provider_event_id text, p_event_type text, p_user_id uuid, p_provider_product_id text, p_environment text, p_occurred_at timestamp with time zone, p_expires_at timestamp with time zone, p_amount_minor integer, p_currency text, p_raw_payload_hash text, p_original_transaction_id text, p_input_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin

  if upper(trim(coalesce(p_event_type,'')))='PRODUCT_CHANGE' then
    return private.record_revenuecat_product_change_notice(p_provider_event_id,p_raw_payload_hash);
  end if;
  if upper(trim(coalesce(p_event_type,'')))='SUBSCRIPTION_PAUSED' then
    return private.record_revenuecat_scheduled_pause(p_provider_event_id,p_raw_payload_hash);
  end if;
  if upper(trim(coalesce(p_event_type,''))) in (
    'CANCELLATION','BILLING_ISSUE','EXPIRATION','REFUND','REVOCATION','SUBSCRIPTION_PAUSED'
  ) then
    return public."process_revenuecat_terminal_event_atomic"(
      'revenuecat_google_play',p_provider_event_id,p_event_type,p_user_id,p_provider_product_id,null,
      p_environment,case upper(trim(coalesce(p_event_type,'')))
        when 'REFUND' then 'revoked' when 'REVOCATION' then 'revoked'
        when 'SUBSCRIPTION_PAUSED' then 'revoked' when 'EXPIRATION' then 'expired'
        when 'CANCELLATION' then 'canceled' else 'pending' end,
      null,p_expires_at,p_occurred_at,p_raw_payload_hash,null,'google_play','android',p_original_transaction_id
    );
  end if;
  return public."process_revenuecat_consumable_event_provider_internal"(
    p_provider_event_id,p_event_type,p_user_id,p_provider_product_id,p_environment,
    p_occurred_at,p_expires_at,p_amount_minor,p_currency,p_raw_payload_hash,
    p_original_transaction_id,'revenuecat_google_play','android','google_play',
    'revenuecat_google_play_enabled',p_input_reason
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_revenuecat_google_play_event_atomic(p_provider_event_id text, p_event_type text, p_user_id uuid, p_provider_product_id text, p_environment text, p_occurred_at timestamp with time zone, p_expires_at timestamp with time zone, p_amount_minor integer, p_currency text, p_raw_payload_hash text, p_original_transaction_id text, p_input_reason text, p_purchase_occurred_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin

  if upper(trim(coalesce(p_event_type,'')))='PRODUCT_CHANGE' then
    return private.record_revenuecat_product_change_notice(p_provider_event_id,p_raw_payload_hash);
  end if;
  if upper(trim(coalesce(p_event_type,'')))='SUBSCRIPTION_PAUSED' then
    return private.record_revenuecat_scheduled_pause(p_provider_event_id,p_raw_payload_hash);
  end if;
  if upper(trim(coalesce(p_event_type,''))) in ('INITIAL_PURCHASE','NON_RENEWING_PURCHASE','RENEWAL','UNCANCELLATION','PRODUCT_CHANGE') then
    perform public.record_creator_money_purchase_time_internal('revenuecat_google_play',p_provider_event_id,p_user_id,
      p_provider_product_id,p_environment,p_raw_payload_hash,p_purchase_occurred_at);
  end if;
  return public.process_revenuecat_google_play_event_atomic(p_provider_event_id,p_event_type,p_user_id,p_provider_product_id,
    p_environment,p_occurred_at,p_expires_at,p_amount_minor,p_currency,p_raw_payload_hash,p_original_transaction_id,p_input_reason);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_revenuecat_live_watch_party_event_atomic(p_provider text, p_provider_event_id text, p_event_type text, p_user_id uuid, p_provider_product_id text, p_environment text, p_occurred_at timestamp with time zone, p_amount_minor integer, p_currency text, p_raw_payload_hash text, p_original_transaction_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_provider text:=lower(trim(coalesce(p_provider,'')));
  v_event_id text:=trim(coalesce(p_provider_event_id,''));
  v_event_type text:=upper(trim(coalesce(p_event_type,'')));
  v_environment text:=lower(trim(coalesce(p_environment,'')));
  v_original text:=trim(coalesce(p_original_transaction_id,''));
  v_product_ref text:=trim(coalesce(p_provider_product_id,''));
  v_currency text:=lower(trim(coalesce(p_currency,'')));
  v_now timestamptz:=timezone('utc'::text,now());
  v_occurred timestamptz:=least(coalesce(p_occurred_at,v_now),v_now);
  v_active boolean;
  v_terminal boolean;
  v_rank smallint;
  v_existing public."provider_events"%rowtype;
  v_link public."revenuecat_consumable_transaction_intents"%rowtype;
  v_intent public."money_purchase_intents"%rowtype;
  v_offer public."paid_live_watch_party_offers"%rowtype;
  v_original_pass public."paid_live_watch_party_passes"%rowtype;
  v_original_provider public."provider_events"%rowtype;
  v_room public."watch_party_rooms"%rowtype;
  v_product public."monetization_products"%rowtype;
  v_event public."provider_events"%rowtype;
  v_grant public."access_grants"%rowtype;
  v_ledger public."money_access_ledger_events"%rowtype;
  v_original_ledger public."money_access_ledger_events"%rowtype;
  v_remaining_access boolean:=false;
  v_remaining_seat boolean:=false;
  v_status text;
  v_payable text;
  v_authority_failure text;
begin

  if upper(trim(coalesce(p_event_type,'')))='PRODUCT_CHANGE' then
    return private.record_revenuecat_product_change_notice(p_provider_event_id,p_raw_payload_hash);
  end if;
  if upper(trim(coalesce(p_event_type,'')))='SUBSCRIPTION_PAUSED' then
    return private.record_revenuecat_scheduled_pause(p_provider_event_id,p_raw_payload_hash);
  end if;
  v_active:=v_event_type in ('INITIAL_PURCHASE','NON_RENEWING_PURCHASE');
  v_terminal:=v_event_type in ('REFUND','REVOCATION','EXPIRATION','CANCELLATION','BILLING_ISSUE','SUBSCRIPTION_PAUSED');
  v_rank:=public."revenuecat_premium_authority_rank_internal"(v_event_type,false);
  if v_provider not in ('revenuecat_app_store','revenuecat_google_play')
    or v_event_id='' or length(v_event_id)>512 or v_event_id is distinct from coalesce(p_provider_event_id,'')
    or v_event_id~'[[:cntrl:]]' or p_user_id is null or (not v_active and not v_terminal)
    or v_environment not in ('sandbox','production')
    or v_original='' or length(v_original)>512 or v_original is distinct from coalesce(p_original_transaction_id,'')
    or v_original~'[[:cntrl:]]' or v_product_ref='' or length(v_product_ref)>512 or v_product_ref~'[[:cntrl:]]'
    or coalesce(p_raw_payload_hash,'')!~'^[0-9a-f]{64}$'
  then raise exception 'live_watch_party_provider_identity_invalid'; end if;
  if v_active and (coalesce(p_amount_minor,0)<=0 or v_currency!~'^[a-z]{3}$')
  then raise exception 'live_watch_party_provider_financials_invalid'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('revenuecat-live-event:'||v_event_id,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('revenuecat-original:'||v_provider||':'||v_original,0));
  select event.* into v_existing from public."provider_events" event
  where event."provider"=v_provider and event."provider_event_id"=v_event_id for update;
  if v_existing."id" is not null then
    if v_existing."raw_payload_hash" is distinct from p_raw_payload_hash
      or v_existing."user_id" is distinct from p_user_id
      or v_existing."event_type" is distinct from v_event_type
      or v_existing."environment" is distinct from v_environment
      or v_existing."metadata"->>'original_transaction_id' is distinct from v_original
      or v_existing."metadata"->>'provider_product_id' is distinct from v_product_ref
    then raise exception 'live_watch_party_provider_event_replay_mismatch'; end if;
    return jsonb_build_object('status',v_existing."status",'reason','duplicate_provider_event',
      'providerEventId',v_existing."id",'duplicateProviderEvent',true,'authorityGranted',false);
  end if;
  select link.* into v_link from public."revenuecat_consumable_transaction_intents" link
  where link."provider"=v_provider and link."original_transaction_id"=v_original
    and link."binding_state"='exact' for update;
  if v_link."purchase_intent_id" is not null then
    select intent.* into v_intent from public."money_purchase_intents" intent
    where intent."id"=v_link."purchase_intent_id" for update;
  elsif v_active then
    select intent.* into v_intent from public."money_purchase_intents" intent
    where intent."user_id"=p_user_id and intent."provider"=v_provider
      and intent."provider_product_id"=v_product_ref and intent."environment"=v_environment
      and intent."source_type" in ('live_watch_party_access','live_watch_party_seat')
      and intent."status"='pending' and intent."expires_at">v_now
      and intent."amount_minor"=p_amount_minor and lower(intent."currency")=v_currency
    order by intent."created_at",intent."id" limit 1 for update;
    if v_intent."id" is null or exists (
      select 1 from public."money_purchase_intents" other
      where other."user_id"=p_user_id and other."provider"=v_provider
        and other."provider_product_id"=v_product_ref and other."environment"=v_environment
        and other."source_type" in ('live_watch_party_access','live_watch_party_seat')
        and other."status"='pending' and other."expires_at">v_now
        and other."amount_minor"=p_amount_minor and lower(other."currency")=v_currency
        and other."id"<>v_intent."id")
    then raise exception 'live_watch_party_purchase_intent_missing_or_ambiguous'; end if;
  else
    raise exception 'live_watch_party_original_transaction_binding_required';
  end if;
  if v_intent."user_id" is distinct from p_user_id or v_intent."provider" is distinct from v_provider
    or v_intent."provider_product_id" is distinct from v_product_ref
    or v_intent."environment" is distinct from v_environment
    or v_intent."source_type" not in ('live_watch_party_access','live_watch_party_seat')
  then raise exception 'live_watch_party_bound_intent_mismatch'; end if;
  select offer.* into v_offer from public."paid_live_watch_party_offers" offer
  where offer."id"=v_intent."source_id" for update;
  select room.* into v_room from public."watch_party_rooms" room where room."party_id"=v_offer."party_id";
  select product.* into v_product from public."monetization_products" product where product."id"=v_intent."product_id";
  if v_link."purchase_intent_id" is not null then
    select pass_row.* into v_original_pass from public."paid_live_watch_party_passes" pass_row
    where pass_row."provider_event_id"=v_link."provider_event_id"
      and pass_row."offer_id"=v_intent."source_id" and pass_row."buyer_id"=p_user_id
      and pass_row."creator_id"=v_intent."creator_id" and pass_row."pass_type"=v_intent."product_type";
    select provider_event.* into v_original_provider from public."provider_events" provider_event
    where provider_event."id"=v_link."provider_event_id";
    if v_original_pass."id" is null or v_original_provider."id" is null
      or v_original_provider."user_id" is distinct from p_user_id
      or v_original_provider."product_id" is distinct from v_intent."product_id"
      or v_original_provider."environment" is distinct from v_environment
      or v_original_provider."metadata"->>'purchase_intent_id' is distinct from v_intent."id"::text
      or v_original_provider."metadata"->>'original_transaction_id' is distinct from v_original
    then raise exception 'live_watch_party_original_transaction_pass_binding_invalid'; end if;
  else
    if v_offer."id" is null or v_room."party_id" is null or v_room."room_type"<>'live'
      or v_offer."creator_id" is distinct from v_intent."creator_id"
      or v_offer."host_user_id" is distinct from v_intent."creator_id"
      or v_room."host_user_id" is distinct from v_offer."host_user_id"
      or v_offer."pass_type" is distinct from v_product."product_type"
      or v_offer."pass_type" is distinct from v_intent."product_type"
      or v_offer."pass_type" not in ('live_watch_party_access_pass','live_watch_party_seat_pass')
    then raise exception 'live_watch_party_exact_target_binding_invalid'; end if;
    -- Store identity and economics come from the immutable accepted intent.
    -- Editing this exact room offer must not rewrite an already agreed charge.
    if v_product."product_key" is distinct from v_intent."product_key"
      or v_product."provider" is distinct from v_provider
      or v_product."provider_product_id" is distinct from v_product_ref
      or v_product."environment" is distinct from v_environment
      or v_intent."amount_minor" is distinct from p_amount_minor
      or lower(v_intent."currency") is distinct from v_currency
    then raise exception 'live_watch_party_active_offer_binding_stale'; end if;
    if not coalesce(v_room."is_active",false) or v_offer."status" not in ('sandbox','active')
    then raise exception 'live_watch_party_target_no_longer_available'; end if;
  end if;
  if v_active then
    if v_environment<>'sandbox' then raise exception 'live_watch_party_production_activation_not_authorized'; end if;
    perform public."assert_live_watch_party_sandbox_rail_internal"(v_intent."product_type");
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'live-watch-party-authority:'||coalesce(v_original_pass."party_id",v_offer."party_id")||':'||p_user_id::text,0
  ));
  v_status:=case when v_active then 'processed' when v_event_type='REFUND' then 'refunded'
    when v_event_type in ('REVOCATION','SUBSCRIPTION_PAUSED') then 'reversed' else 'processed' end;
  insert into public."provider_events"(
    "provider_event_id","provider","product_id","product_key","user_id","app_user_id",
    "environment","event_type","status","occurred_at","idempotency_key","raw_payload_hash","metadata"
  ) values (
    v_event_id,v_provider,v_product."id",v_product."product_key",p_user_id,p_user_id::text,
    v_environment,v_event_type,v_status,v_occurred,v_event_type||':'||v_event_id,p_raw_payload_hash,
    jsonb_build_object('provider_payload_stored',false,'provider_product_id',v_product_ref,
      'original_transaction_id',v_original,'purchase_intent_id',v_intent."id",
      'live_watch_party_offer_id',v_intent."source_id",
      'party_id',case when v_original_pass."id" is null then v_offer."party_id" else v_original_pass."party_id" end,
      'creator_id',case when v_original_pass."id" is null then v_offer."creator_id" else v_original_pass."creator_id" end,
      'host_user_id',case when v_original_pass."id" is null then v_offer."host_user_id"::text else v_original_provider."metadata"->>'host_user_id' end,
      'pass_type',case when v_original_pass."id" is null then v_offer."pass_type" else v_original_pass."pass_type" end,
      'authority_granted',false,'grants_publish',false,'payout_ready',false)
  ) returning * into v_event;
  if v_active and v_link."purchase_intent_id" is not null then
    update public."provider_events" set "status"='ignored',
      "metadata"="metadata"||jsonb_build_object(
        'final_reason','duplicate_original_transaction','provider_reconciliation_required',true,
        'provider_reconciliation_disposition','refund_or_authoritative_provider_reconciliation_required'
      ) where "id"=v_event."id" returning * into v_event;
    return jsonb_build_object('status','ignored','reason','duplicate_original_transaction',
      'providerEventId',v_event."id",'purchaseIntentId',v_intent."id",
      'environment',v_environment,'duplicateProviderEvent',false,'authorityGranted',false);
  end if;
  if v_active then
    -- A signed charge is evidence, not permission to bypass the original
    -- buyer/session or quarantined authority. Preserve the provider event and
    -- permanently bind ignored originals for refund/provider reconciliation.
    select 'initial_authority_not_rebindable' into v_authority_failure
    from public."revenuecat_unbound_initial_authority" ignored
    where ignored."provider"=v_provider and ignored."original_transaction_id"=v_original;
    if v_authority_failure is null then
      if p_occurred_at is null or not isfinite(p_occurred_at) then
        v_authority_failure:='provider_occurred_at_missing_or_invalid';
      elsif public."revenuecat_authority_quarantined_internal"(v_provider,p_user_id,v_environment) then
        v_authority_failure:='revenuecat_terminal_authority_quarantined';
      elsif not public."money_purchase_intent_session_authorized_internal"(
        v_intent."user_id",v_intent."session_generation"
      ) then
        v_authority_failure:='purchase_intent_session_authority_not_current';
      elsif public."is_account_access_restricted"(p_user_id::text) then
        v_authority_failure:='buyer_account_restricted';
      elsif v_intent."creator_id" is null
        or public."is_account_access_restricted"(v_intent."creator_id"::text) then
        v_authority_failure:='creator_source_authority_restricted';
      end if;
    end if;
    if v_authority_failure is not null then
      insert into public."revenuecat_unbound_initial_authority"(
        "provider","original_transaction_id","user_id","provider_product_id","environment",
        "first_provider_event_id","first_ignore_reason"
      ) values (
        v_provider,v_original,p_user_id,v_product_ref,v_environment,v_event."id",v_authority_failure
      ) on conflict ("provider","original_transaction_id") do nothing;
      update public."provider_events"
      set "status"='ignored',
        "idempotency_key"='creator_money:live_watch_party:'||v_event_type||':'||v_event_id,
        "metadata"="metadata"||jsonb_build_object(
        'final_reason',v_authority_failure,'authority_granted',false,'payout_ready',false,
        'reported_amount_minor',p_amount_minor,'reported_currency',v_currency,
        'provider_reconciliation_required',true,
        'provider_reconciliation_disposition','refund_or_authoritative_provider_reconciliation_required'
      ) where "id"=v_event."id";
      return jsonb_build_object('status','ignored','reason',v_authority_failure,
        'providerEventId',v_event."id",'purchaseIntentId',v_intent."id",
        'environment',v_environment,'duplicateProviderEvent',false,'authorityGranted',false);
    end if;
  end if;
  if v_active then
    update public."money_purchase_intents" set "status"='consumed',"consumed_at"=v_now,"updated_at"=v_now
    where "id"=v_intent."id" and "status"='pending';
    insert into public."revenuecat_consumable_transaction_intents"(
      "provider","original_transaction_id","user_id","product_id","purchase_intent_id","provider_event_id",
      "last_provider_event_id","last_occurred_at","last_event_type","last_event_rank","terminal","binding_state"
    ) values (
      v_provider,v_original,p_user_id,v_product."id",v_intent."id",v_event."id",
      v_event."id",v_occurred,v_event_type,v_rank,false,'exact'
    ) returning * into v_link;
    insert into public."access_grants"(
      "user_id","grant_type","source_type","source_id","product_id","provider","provider_event_id",
      "environment","status","starts_at","metadata"
    ) values (
      p_user_id,v_offer."pass_type",'provider_event',v_offer."id",v_product."id",v_provider,v_event."id",
      v_environment,case when v_environment='sandbox' then 'sandbox_only' else 'active' end,v_occurred,
      jsonb_build_object('purchase_intent_id',v_intent."id",'original_transaction_id',v_original,
        'party_id',v_offer."party_id",'creator_id',v_offer."creator_id",'host_user_id',v_offer."host_user_id",
        'viewer_access_only',v_offer."pass_type"='live_watch_party_access_pass',
        'seat_eligibility_only',v_offer."pass_type"='live_watch_party_seat_pass',
        'host_approval_required',v_offer."pass_type"='live_watch_party_seat_pass',
        'authority_granted',false,'payment_role_authority',false,'payment_media_authority',false)
    ) returning * into v_grant;
    insert into public."paid_live_watch_party_passes"(
      "offer_id","party_id","buyer_id","creator_id","pass_type","access_grant_id","provider_event_id","status"
    ) values (v_offer."id",v_offer."party_id",p_user_id,v_offer."creator_id",v_offer."pass_type",v_grant."id",v_event."id",'active');
    v_payable:=case when v_environment='sandbox' then 'not_payable' else 'pending_verification' end;
    insert into public."money_access_ledger_events"(
      "user_id","creator_id","product_id","provider_event_id","event_type","amount_minor","currency",
      "environment","payable_state","status","source_type","source_id","metadata"
    ) values (
      p_user_id,v_offer."creator_id",v_product."id",v_event."id",v_event_type,p_amount_minor,v_currency,
      v_environment,v_payable,case when v_environment='sandbox' then 'sandbox_only' else 'verified' end,
      v_intent."source_type",v_offer."id",jsonb_build_object('purchase_intent_id',v_intent."id",
        'original_transaction_id',v_original,'party_id',v_offer."party_id",'pass_type',v_offer."pass_type",
        'completion_required',true,'post_completion_hold_hours',48,'reserve_basis_points',1000,
        'payout_readiness_proved',false,'grants_livekit_authority',false)
    ) returning * into v_ledger;
    return jsonb_build_object('status','processed','reason','exact_live_watch_party_purchase_applied',
      'productKey',v_product."product_key",'productType',v_product."product_type",
      'providerEventId',v_event."id",'purchaseIntentId',v_intent."id",'accessGrantId',v_grant."id",
      'ledgerEventId',v_ledger."id",'grantStatus',v_grant."status",'payableState',v_ledger."payable_state",
      'environment',v_environment,'duplicateProviderEvent',false,'authorityGranted',false);
  end if;
  if v_link."last_occurred_at">v_occurred
    or (v_link."last_occurred_at"=v_occurred and v_link."last_event_rank">=v_rank)
  then
    update public."provider_events" set "status"='ignored',"metadata"="metadata"||jsonb_build_object('final_reason','stale_terminal_event') where "id"=v_event."id";
    return jsonb_build_object('status','ignored','reason','stale_terminal_event','providerEventId',v_event."id",'authorityGranted',false);
  end if;
  update public."revenuecat_consumable_transaction_intents"
  set "last_provider_event_id"=v_event."id","last_occurred_at"=v_occurred,"last_event_type"=v_event_type,
      "last_event_rank"=v_rank,"terminal"=v_event_type in ('REFUND','REVOCATION','SUBSCRIPTION_PAUSED')
  where "provider"=v_provider and "original_transaction_id"=v_original and "binding_state"='exact';
  update public."access_grants" set
    "status"=case when v_event_type='REFUND' then 'refunded' when v_event_type='EXPIRATION' then 'expired' else 'revoked' end,
    "refunded_at"=case when v_event_type='REFUND' then v_occurred else "refunded_at" end,
    "revoked_at"=case when v_event_type<>'REFUND' then v_occurred else "revoked_at" end,
    "revoke_reason"=lower(v_event_type),"updated_at"=v_now
  where "user_id"=p_user_id and "source_id"=v_original_pass."offer_id" and "grant_type"=v_original_pass."pass_type"
    and "metadata"->>'original_transaction_id'=v_original;
  update public."paid_live_watch_party_passes" set
    "status"=case when v_event_type='REFUND' then 'refunded' when v_event_type='EXPIRATION' then 'expired' else 'revoked' end,
    "refunded_at"=case when v_event_type='REFUND' then v_occurred else "refunded_at" end,
    "revoked_at"=case when v_event_type<>'REFUND' then v_occurred else "revoked_at" end,
    "updated_at"=v_now
  where "provider_event_id"=v_link."provider_event_id" and "offer_id"=v_original_pass."offer_id" and "buyer_id"=p_user_id;
  select ledger.* into v_original_ledger from public."money_access_ledger_events" ledger
  where ledger."user_id"=p_user_id and ledger."source_id"=v_original_pass."offer_id"
    and ledger."metadata"->>'original_transaction_id'=v_original
    and ledger."event_type" in ('INITIAL_PURCHASE','NON_RENEWING_PURCHASE')
  order by ledger."created_at" limit 1 for update;
  insert into public."money_access_ledger_events"(
    "user_id","creator_id","product_id","provider_event_id","event_type","amount_minor","currency",
    "environment","payable_state","status","source_type","source_id","metadata"
  ) values (
    p_user_id,v_original_pass."creator_id",v_product."id",v_event."id",v_event_type,
    coalesce(v_original_ledger."amount_minor",v_intent."amount_minor"),
    coalesce(v_original_ledger."currency",v_intent."currency"),v_environment,
    case when v_event_type='REFUND' then 'refunded' when v_event_type='REVOCATION' then 'reversed' else 'not_payable' end,
    case when v_event_type='REFUND' then 'refunded' when v_event_type='REVOCATION' then 'reversed' else 'ignored' end,
    v_intent."source_type",v_original_pass."offer_id",jsonb_build_object(
      'purchase_intent_id',v_intent."id",'original_transaction_id',v_original,
      'party_id',v_original_pass."party_id",'pass_type',v_original_pass."pass_type",
      'reverses_provider_event_id',v_link."provider_event_id",'authority_granted',false,
      'immutable_terminal_evidence',true,'payout_readiness_proved',false
    )
  ) returning * into v_ledger;
  select exists(
    select 1 from public."paid_live_watch_party_passes" pass_row
    join public."paid_live_watch_party_offers" offer on offer."id"=pass_row."offer_id"
    join public."access_grants" grant_row on grant_row."id"=pass_row."access_grant_id"
    where pass_row."party_id"=v_original_pass."party_id" and pass_row."buyer_id"=p_user_id
      and pass_row."status"='active' and offer."status" in ('sandbox','active')
      and pass_row."pass_type"='live_watch_party_access_pass'
      and grant_row."status" in ('active','sandbox_only') and grant_row."revoked_at" is null
      and grant_row."refunded_at" is null
      and (grant_row."expires_at" is null or grant_row."expires_at">v_now)
  ) into v_remaining_access;
  select exists(
    select 1 from public."paid_live_watch_party_passes" pass_row
    join public."paid_live_watch_party_offers" offer on offer."id"=pass_row."offer_id"
    join public."access_grants" grant_row on grant_row."id"=pass_row."access_grant_id"
    where pass_row."party_id"=v_original_pass."party_id" and pass_row."buyer_id"=p_user_id
      and pass_row."status"='active' and offer."status" in ('sandbox','active')
      and pass_row."pass_type"='live_watch_party_seat_pass'
      and grant_row."status" in ('active','sandbox_only') and grant_row."revoked_at" is null
      and grant_row."refunded_at" is null
      and (grant_row."expires_at" is null or grant_row."expires_at">v_now)
  ) into v_remaining_seat;
  if not v_remaining_access and exists (select 1 from public."paid_live_watch_party_offers" offer
    where offer."party_id"=v_original_pass."party_id" and offer."pass_type"='live_watch_party_access_pass'
      and offer."status" in ('sandbox','active')) then
    update public."watch_party_room_memberships" set "role"='viewer',"stage_role"='listener',
      "can_speak"=false,"camera_enabled"=false,"mic_enabled"=false,"membership_state"='removed',
      "left_at"=coalesce("left_at",v_now),"updated_at"=v_now
    where "party_id"=v_original_pass."party_id" and "user_id"=p_user_id::text
      and "membership_state" in ('active','reconnecting');
  elsif not v_remaining_seat and exists (select 1 from public."paid_live_watch_party_offers" offer
    where offer."party_id"=v_original_pass."party_id" and offer."pass_type"='live_watch_party_seat_pass'
      and offer."status" in ('sandbox','active')) then
    update public."watch_party_room_memberships" set "role"='viewer',"stage_role"='listener',
      "can_speak"=false,"camera_enabled"=false,"mic_enabled"=false,"updated_at"=v_now
    where "party_id"=v_original_pass."party_id" and "user_id"=p_user_id::text
      and "membership_state" in ('active','reconnecting');
  end if;
  return jsonb_build_object('status',v_status,'reason','exact_live_watch_party_terminal_applied',
    'productKey',v_product."product_key",'productType',v_product."product_type",
    'providerEventId',v_event."id",'purchaseIntentId',v_intent."id",'ledgerEventId',v_ledger."id",
    'grantStatus',case when v_event_type='REFUND' then 'refunded' else 'revoked' end,
    'environment',v_environment,'duplicateProviderEvent',false,'authorityGranted',false);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_revenuecat_premium_event_atomic(p_provider text, p_provider_event_id text, p_event_type text, p_user_id uuid, p_provider_product_id text, p_provider_base_plan_id text, p_environment text, p_entitlement_status text, p_starts_at timestamp with time zone, p_expires_at timestamp with time zone, p_occurred_at timestamp with time zone, p_amount_minor integer, p_currency text, p_raw_payload_hash text, p_period_type text, p_store text, p_platform text, p_store_mapping_id uuid, p_product_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz := timezone('utc'::text,now());
  v_provider text := lower(trim(coalesce(p_provider,'')));
  v_event_id text := trim(coalesce(p_provider_event_id,''));
  v_event_type text := upper(trim(coalesce(p_event_type,'')));
  v_environment text := lower(trim(coalesce(p_environment,'')));
  v_status text := lower(trim(coalesce(p_entitlement_status,'')));
  v_currency text := trim(coalesce(p_currency,''));
  v_store text := lower(trim(coalesce(p_store,'')));
  v_platform text := lower(trim(coalesce(p_platform,'')));
  v_active_authority boolean;
  v_grant_capable_event boolean;
  v_terminal_event boolean;
  v_reason text;
  v_switch text;
  v_webhook_switch text;
  v_latest public."provider_events"%rowtype;
  v_product public."monetization_products"%rowtype;
  v_result jsonb;
begin

  if upper(trim(coalesce(p_event_type,'')))='PRODUCT_CHANGE' then
    return private.record_revenuecat_product_change_notice(p_provider_event_id,p_raw_payload_hash);
  end if;
  if upper(trim(coalesce(p_event_type,'')))='SUBSCRIPTION_PAUSED' then
    return private.record_revenuecat_scheduled_pause(p_provider_event_id,p_raw_payload_hash);
  end if;
  if v_provider not in ('revenuecat_app_store','revenuecat_google_play')
    or v_event_id=''
    or v_event_type not in (
      'INITIAL_PURCHASE','NON_RENEWING_PURCHASE','PRODUCT_CHANGE','RENEWAL','UNCANCELLATION',
      'CANCELLATION','EXPIRATION','BILLING_ISSUE','REFUND','REVOCATION','SUBSCRIPTION_PAUSED'
    )
    or p_user_id is null or p_product_id is null
    or v_environment not in ('setup','sandbox','production')
    or coalesce(p_raw_payload_hash,'') !~ '^[0-9a-f]{64}$'
  then
    raise exception 'revenuecat_premium_event_identity_invalid';
  end if;
  if not (
    (v_provider='revenuecat_app_store' and v_store='app_store' and v_platform='ios')
    or (v_provider='revenuecat_google_play' and v_store='google_play' and v_platform='android')
  ) then
    raise exception 'revenuecat_premium_provider_store_tuple_invalid';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-premium-event-id:' || v_event_id,0
  ));
  if exists (
    select 1 from public."provider_events" event
    where event."provider" in ('revenuecat','revenuecat_app_store','revenuecat_google_play')
      and event."provider_event_id"=v_event_id
      and (
        event."provider" is distinct from v_provider
        or event."event_type" is distinct from v_event_type
        or event."user_id" is distinct from p_user_id
        or event."product_id" is distinct from p_product_id
        or event."environment" is distinct from v_environment
        or event."raw_payload_hash" is distinct from p_raw_payload_hash
        or event."metadata"->>'provider_product_id' is distinct from nullif(trim(coalesce(p_provider_product_id,'')),'')
        or event."metadata"->>'provider_base_plan_id' is distinct from nullif(trim(coalesce(p_provider_base_plan_id,'')),'')
      )
  ) then
    raise exception 'revenuecat_premium_event_id_identity_mismatch';
  end if;

  select product.* into v_product
  from public."monetization_products" product
  where product."id"=p_product_id and product."product_type"='premium_subscription';
  if v_product."id" is null then raise exception 'premium_product_not_found'; end if;

  v_active_authority := v_status in ('active','trialing','grace_period');
  v_grant_capable_event := v_event_type in (
    'INITIAL_PURCHASE','NON_RENEWING_PURCHASE','PRODUCT_CHANGE','RENEWAL','UNCANCELLATION'
  );
  v_terminal_event := v_event_type in (
    'CANCELLATION','BILLING_ISSUE','EXPIRATION','REFUND','REVOCATION','SUBSCRIPTION_PAUSED'
  );
  if p_occurred_at is null then v_reason := 'premium_occurred_at_required';
  elsif p_occurred_at > v_now + interval '5 minutes' then v_reason := 'premium_occurred_at_future_skew';
  elsif v_event_type in ('REFUND','REVOCATION','SUBSCRIPTION_PAUSED') and v_status<>'revoked' then
    v_reason := 'premium_terminal_status_incoherent';
  elsif v_event_type='EXPIRATION' and v_status<>'expired' then
    v_reason := 'premium_expiration_status_incoherent';
  elsif v_event_type='CANCELLATION' and v_status not in ('active','canceled') then
    v_reason := 'premium_cancellation_status_incoherent';
  elsif v_event_type='BILLING_ISSUE' and v_status not in ('grace_period','pending') then
    v_reason := 'premium_billing_status_incoherent';
  elsif v_event_type in ('INITIAL_PURCHASE','NON_RENEWING_PURCHASE','PRODUCT_CHANGE','RENEWAL','UNCANCELLATION')
    and v_status not in ('active','trialing') then
    v_reason := 'premium_active_status_incoherent';
  elsif v_active_authority and v_environment not in ('sandbox','production') then
    v_reason := 'premium_active_environment_invalid';
  elsif v_active_authority and (
    p_starts_at is null or p_starts_at > v_now + interval '5 minutes'
    or p_expires_at is null or p_expires_at <= v_now or p_expires_at <= p_starts_at
  ) then
    v_reason := 'premium_finite_period_invalid';
  elsif v_grant_capable_event and (p_amount_minor is null or p_amount_minor<=0) then
    v_reason := 'premium_positive_amount_required';
  elsif v_grant_capable_event and (
    v_currency !~ '^[a-z]{3}$'
    or p_currency is distinct from v_currency
    or public."money_currency_minor_unit_exponent_internal"(v_currency) is null
  ) then
    v_reason := 'premium_currency_invalid';
  end if;

  if v_reason is null and v_event_type<>'INITIAL_PURCHASE' and not exists (
    select 1
    from public."provider_events" prior
    where prior."user_id"=p_user_id and prior."product_id"=p_product_id
      and prior."provider" in (v_provider,'revenuecat') and prior."environment"=v_environment
      and prior."provider_event_id"<>v_event_id
      and prior."status" in ('processed','refunded','reversed')
      and prior."metadata"->>'provider_product_id'=p_provider_product_id
      and prior."metadata"->>'provider_base_plan_id' is not distinct from nullif(trim(coalesce(p_provider_base_plan_id,'')),'')
  ) and not (
    v_event_type='PRODUCT_CHANGE'
    and public."premium_subject_has_finite_authority_internal"(p_user_id::text)
    and exists (
      select 1
      from public."provider_events" prior
      join public."monetization_products" prior_product
        on prior_product."id"=prior."product_id" and prior_product."product_type"='premium_subscription'
      join public."user_entitlements" entitlement
        on entitlement."user_id"=p_user_id::text and entitlement."entitlement_key"='premium'
       and entitlement."metadata"->>'revenuecat_event_id'=prior."provider_event_id"
      where prior."user_id"=p_user_id and prior."provider" in (v_provider,'revenuecat')
        and prior."environment"=v_environment and prior."status"='processed'
    )
  ) then
    v_reason := 'premium_prior_purchase_authority_missing';
  end if;
  if v_reason is null and v_active_authority
    and v_event_type in ('CANCELLATION','BILLING_ISSUE')
    and not exists (
      select 1 from public."user_entitlements" entitlement
      where entitlement."user_id"=p_user_id::text and entitlement."entitlement_key"='premium'
        and entitlement."starts_at"=p_starts_at and entitlement."expires_at"=p_expires_at
        and public."premium_subject_has_finite_authority_internal"(p_user_id::text)
    )
  then
    v_reason := 'premium_retain_only_period_binding_missing';
  end if;

  if v_reason is null and v_grant_capable_event
    and public."is_account_access_restricted"(p_user_id::text)
  then
    v_reason := 'premium_buyer_account_restricted';
  end if;

  if v_reason is null and v_grant_capable_event then
    if nullif(trim(coalesce(p_provider_product_id,'')),'') is null then
      v_reason := 'premium_provider_product_id_required';
    elsif v_provider='revenuecat_app_store' and not exists (
      select 1 from public."monetization_product_store_mappings" mapping
      where mapping."id"=p_store_mapping_id and mapping."product_id"=p_product_id
        and mapping."concept"='premium' and mapping."platform"='ios' and mapping."store"='app_store'
        and mapping."provider"=v_provider and mapping."provider_product_id"=p_provider_product_id
        and mapping."provider_base_plan_id" is not distinct from nullif(trim(coalesce(p_provider_base_plan_id,'')),'')
        and mapping."environment"=v_environment
        and mapping."status"=case when v_environment='production' then 'active' else 'sandbox' end
        and mapping."store_product_type"='auto_renewable_subscription'
        and mapping."unlocks_digital_access" and not mapping."grants_livekit_authority"
        and not mapping."creates_payable_balance"
    ) then
      v_reason := 'premium_app_store_mapping_not_active';
    elsif v_provider='revenuecat_google_play' and not (
      v_product."provider" in ('revenuecat_google_play','google_play','revenuecat')
      and v_product."provider_product_id"=p_provider_product_id
      and v_product."provider_base_plan_id" is not distinct from nullif(trim(coalesce(p_provider_base_plan_id,'')),'')
      and v_product."environment"=v_environment
      and v_product."status"=case when v_environment='production' then 'active' else 'sandbox' end
    ) then
      v_reason := 'premium_google_product_not_active';
    end if;
    select "state" into v_switch from public."platform_money_kill_switches"
    where "key"=case when v_provider='revenuecat_app_store' then 'revenuecat_app_store_enabled' else 'revenuecat_google_play_enabled' end;
    select "state" into v_webhook_switch from public."platform_money_kill_switches" where "key"='provider_webhooks_enabled';
    if v_reason is null and (
      (v_environment='sandbox' and (coalesce(v_switch,'off') not in ('sandbox_only','on') or coalesce(v_webhook_switch,'off') not in ('sandbox_only','on')))
      or (v_environment='production' and (coalesce(v_switch,'off')<>'on' or coalesce(v_webhook_switch,'off')<>'on'))
    ) then
      v_reason := 'premium_provider_rail_disabled';
    end if;
  end if;

  if v_reason is null and v_grant_capable_event and v_environment<>'production' and (
    exists (
      select 1 from public."provider_events" event
      join public."monetization_products" product on product."id"=event."product_id" and product."product_type"='premium_subscription'
      where event."user_id"=p_user_id and event."environment"='production'
        and event."status" in ('processed','refunded','reversed')
    ) or exists (
      select 1 from public."user_entitlements" entitlement
      where entitlement."user_id"=p_user_id::text and entitlement."entitlement_key"='premium'
        and entitlement."source"='revenuecat' and entitlement."metadata"->>'environment'='production'
    )
  ) then
    v_reason := 'premium_lower_environment_cannot_override_production';
  end if;

  select event.* into v_latest
  from public."provider_events" event
  join public."monetization_products" product on product."id"=event."product_id" and product."product_type"='premium_subscription'
  where event."user_id"=p_user_id and event."environment"=v_environment
    and (
      event."status" in ('processed','refunded','reversed')
      or (event."status"='ignored' and event."metadata"->>'premium_authority_watermark'='true')
    )
  order by event."occurred_at" desc,
    public."revenuecat_premium_authority_rank_internal"(event."event_type",false) desc,
    event."provider_event_id" collate "C" desc
  limit 1;
  if v_reason is null and v_latest."id" is not null and public."revenuecat_premium_authority_is_newer_internal"(
    v_latest."occurred_at",v_latest."event_type",v_latest."provider_event_id",false,
    p_occurred_at,v_event_type,v_event_id,false
  ) then
    v_reason := 'premium_provider_authority_event_stale';
  end if;
  if v_reason is null and v_grant_capable_event
    and v_latest."event_type" in ('REFUND','REVOCATION','SUBSCRIPTION_PAUSED')
    and v_event_type<>'INITIAL_PURCHASE'
  then
    v_reason := 'premium_terminal_requires_fresh_initial';
  end if;

  -- Access-removing events require exact durable subject/product/provider
  -- provenance, but never depend on current activation switches.
  if v_reason is null and v_terminal_event
    and not exists (
      select 1 from public."provider_events" prior
      where prior."user_id"=p_user_id and prior."product_id"=p_product_id
        and prior."provider" in (v_provider,'revenuecat') and prior."environment"=v_environment
        and prior."status" in ('processed','refunded','reversed')
        and prior."metadata"->>'provider_product_id'=p_provider_product_id
        and prior."metadata"->>'provider_base_plan_id' is not distinct from nullif(trim(coalesce(p_provider_base_plan_id,'')),'')
    )
  then
    v_reason := 'premium_terminal_binding_missing';
  end if;

  if v_reason is not null then
    return public."record_revenuecat_premium_ignored_internal"(
      v_provider,v_event_id,v_event_type,p_user_id,p_provider_product_id,p_provider_base_plan_id,v_environment,
      p_occurred_at,p_raw_payload_hash,p_product_id,v_reason,
      v_event_type in ('CANCELLATION','BILLING_ISSUE','EXPIRATION','REFUND','REVOCATION','SUBSCRIPTION_PAUSED')
    );
  end if;
  v_result:=public."process_revenuecat_premium_event_atomic_pre_integrity_closeout"(
    v_provider,v_event_id,v_event_type,p_user_id,p_provider_product_id,p_provider_base_plan_id,
    v_environment,v_status,p_starts_at,p_expires_at,p_occurred_at,p_amount_minor,p_currency,
    p_raw_payload_hash,p_period_type,p_store,p_platform,p_store_mapping_id,p_product_id
  );
  if v_event_type='PRODUCT_CHANGE' and coalesce(v_result->>'status','')<>'ignored' then
    update public."access_grants" grant_row
    set "status"='blocked',"revoked_at"=coalesce(grant_row."revoked_at",p_occurred_at),
        "revoke_reason"=coalesce(grant_row."revoke_reason",'Superseded by exact Premium product change.'),
        "updated_at"=v_now,
        "metadata"=coalesce(grant_row."metadata",'{}'::jsonb)||jsonb_build_object(
          'superseded_by_product_id',p_product_id,'superseded_by_event_id',v_event_id,'authority_granted',false
        )
    where grant_row."user_id"=p_user_id and grant_row."grant_type"='premium'
      and grant_row."product_id" is distinct from p_product_id
      and grant_row."status" in ('active','sandbox_only');
  end if;
  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_revenuecat_premium_event_atomic(p_provider text, p_provider_event_id text, p_event_type text, p_user_id uuid, p_provider_product_id text, p_provider_base_plan_id text, p_environment text, p_entitlement_status text, p_starts_at timestamp with time zone, p_expires_at timestamp with time zone, p_occurred_at timestamp with time zone, p_amount_minor integer, p_currency text, p_raw_payload_hash text, p_period_type text, p_store text, p_platform text, p_store_mapping_id uuid, p_product_id uuid, p_original_transaction_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin

  if upper(trim(coalesce(p_event_type,'')))='PRODUCT_CHANGE' then
    return private.record_revenuecat_product_change_notice(p_provider_event_id,p_raw_payload_hash);
  end if;
  if upper(trim(coalesce(p_event_type,'')))='SUBSCRIPTION_PAUSED' then
    return private.record_revenuecat_scheduled_pause(p_provider_event_id,p_raw_payload_hash);
  end if;
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
$function$
;

CREATE OR REPLACE FUNCTION public.process_revenuecat_terminal_event_atomic(p_provider text, p_provider_event_id text, p_event_type text, p_user_id uuid, p_reported_provider_product_id text, p_reported_provider_base_plan_id text, p_environment text, p_entitlement_status text, p_starts_at timestamp with time zone, p_expires_at timestamp with time zone, p_occurred_at timestamp with time zone, p_raw_payload_hash text, p_period_type text, p_store text, p_platform text, p_original_transaction_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_intent public."money_purchase_intents"%rowtype; v_result jsonb;
  v_provider text:=lower(trim(coalesce(p_provider,'')));
  v_reported_product text:=nullif(trim(coalesce(p_reported_provider_product_id,'')),'');
  v_reported_base_plan text:=nullif(trim(coalesce(p_reported_provider_base_plan_id,'')),'');
begin

  if upper(trim(coalesce(p_event_type,'')))='PRODUCT_CHANGE' then
    return private.record_revenuecat_product_change_notice(p_provider_event_id,p_raw_payload_hash);
  end if;
  if upper(trim(coalesce(p_event_type,'')))='SUBSCRIPTION_PAUSED' then
    return private.record_revenuecat_scheduled_pause(p_provider_event_id,p_raw_payload_hash);
  end if;
  select intent.* into v_intent
  from public."revenuecat_consumable_transaction_intents" link
  join public."money_purchase_intents" intent on intent."id"=link."purchase_intent_id"
  where link."provider"=lower(trim(coalesce(p_provider,'')))
    and link."original_transaction_id"=trim(coalesce(p_original_transaction_id,''))
    and link."binding_state"='exact';
  if v_intent."source_type" in ('live_watch_party_access','live_watch_party_seat') then
    if not (
      (v_provider='revenuecat_app_store' and lower(trim(coalesce(p_store,'')))='app_store' and lower(trim(coalesce(p_platform,'')))='ios')
      or (v_provider='revenuecat_google_play' and lower(trim(coalesce(p_store,'')))='google_play' and lower(trim(coalesce(p_platform,'')))='android')
    ) or length(trim(coalesce(p_provider_event_id,'')))>512
      or trim(coalesce(p_provider_event_id,''))~'[[:cntrl:]]'
      or length(trim(coalesce(p_original_transaction_id,'')))>512
      or trim(coalesce(p_original_transaction_id,''))~'[[:cntrl:]]'
      or (v_reported_product is not null and (length(v_reported_product)>512 or v_reported_product~'[[:cntrl:]]'))
      or (v_reported_base_plan is not null and (length(v_reported_base_plan)>512 or v_reported_base_plan~'[[:cntrl:]]'))
    then raise exception 'revenuecat_terminal_dispatch_identity_invalid'; end if;
    v_result:=public."process_revenuecat_live_watch_party_event_atomic"(
      p_provider,p_provider_event_id,p_event_type,p_user_id,v_intent."provider_product_id",
      p_environment,p_occurred_at,v_intent."amount_minor",v_intent."currency",
      p_raw_payload_hash,p_original_transaction_id
    );
    update public."provider_events" provider_event set
      "metadata"=coalesce(provider_event."metadata",'{}'::jsonb)||jsonb_strip_nulls(jsonb_build_object(
        'terminal_dispatch_domain','creator_money',
        'reported_provider_product_id',v_reported_product,
        'reported_provider_base_plan_id',v_reported_base_plan,
        'reported_product_mismatch',v_reported_product is distinct from v_intent."provider_product_id"
      ))
    where provider_event."provider"=v_provider
      and provider_event."provider_event_id"=trim(coalesce(p_provider_event_id,''));
    return v_result||jsonb_build_object(
      'domain','creator_money','originalTransactionId',p_original_transaction_id,
      'duplicateEvent',coalesce((v_result->>'duplicateProviderEvent')::boolean,false),
      'authorityGranted',false
    );
  end if;
  return public."process_revenuecat_terminal_event_atomic_pre_live_money_rfgc"(
    p_provider,p_provider_event_id,p_event_type,p_user_id,p_reported_provider_product_id,
    p_reported_provider_base_plan_id,p_environment,p_entitlement_status,p_starts_at,p_expires_at,
    p_occurred_at,p_raw_payload_hash,p_period_type,p_store,p_platform,p_original_transaction_id
  );
end; $function$
;
