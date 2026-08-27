-- Close the specialized Event/VIP/Channel iOS routing gap. Creator-authored
-- offers retain their Google Play catalog identity; an authenticated iOS call
-- must instead receive the exact finite App Store product selected by the
-- server. Historical active grants remain bound to their immutable original
-- store transaction and may suppress a duplicate cross-platform charge.

create or replace function public."creator_money_historical_intent_safe_row_internal"(
  p_user_id uuid,
  p_grant_type text,
  p_source_id uuid,
  p_creator_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_identity jsonb;
  v_intent public."money_purchase_intents"%rowtype;
  v_expected_source_type text;
begin
  if p_user_id is null or p_source_id is null or p_creator_id is null then
    raise exception 'historical_purchase_identity_invalid';
  end if;
  v_expected_source_type:=case p_grant_type
    when 'event_pass' then 'event'
    when 'vip_pass' then 'vip_pass'
    when 'channel_subscription' then 'channel_subscription'
    else null end;
  if v_expected_source_type is null then
    raise exception 'historical_purchase_identity_invalid';
  end if;

  v_identity:=public."creator_money_historical_purchase_identity_internal"(
    p_user_id,p_grant_type,p_source_id
  );
  if coalesce(v_identity->>'id','')
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    raise exception 'historical_purchase_identity_invalid';
  end if;
  select intent.* into v_intent
  from public."money_purchase_intents" intent
  where intent."id"=(v_identity->>'id')::uuid;
  if v_intent."id" is null
    or v_intent."user_id" is distinct from p_user_id
    or v_intent."product_type" is distinct from p_grant_type
    or v_intent."source_type" is distinct from v_expected_source_type
    or v_intent."source_id" is distinct from p_source_id
    or v_intent."creator_id" is distinct from p_creator_id
    or v_intent."provider" not in (
      'revenuecat_app_store','revenuecat_google_play'
    )
    or nullif(pg_catalog.btrim(coalesce(v_intent."provider_product_id",'')),'') is null
    or v_intent."environment" not in ('sandbox','production')
    or v_intent."status"<>'consumed'
    or v_intent."amount_minor"<=0
    or lower(v_intent."currency")!~'^[a-z]{3}$'
    or v_identity->>'provider' is distinct from v_intent."provider"
    or v_identity->>'providerProductId' is distinct from v_intent."provider_product_id"
    or v_identity->>'environment' is distinct from v_intent."environment"
  then
    raise exception 'historical_purchase_identity_invalid';
  end if;
  return public."money_purchase_intent_safe_row"(v_intent);
end;
$$;
revoke all on function public."creator_money_historical_intent_safe_row_internal"(
  uuid,text,uuid,uuid
) from public,anon,authenticated,service_role;

-- Read the complete App Store creator-money rail as one fail-closed state.
-- Callers lock these switch rows before using the result so an activation or
-- rollback cannot change the selected environment halfway through issuance.
create or replace function public."ios_creator_money_expected_environment_internal"()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with states as (
    select switch_row."key",switch_row."state"
    from public."platform_money_kill_switches" switch_row
    where switch_row."key" in (
      'revenuecat_app_store_enabled','provider_webhooks_enabled',
      'digital_sales_enabled','creator_monetization_enabled',
      'live_money_enabled','payouts_enabled'
    )
  )
  select case
    when (select count(*) from states)=6
      and (select "state" from states where "key"='revenuecat_app_store_enabled')='sandbox_only'
      and (select "state" from states where "key"='provider_webhooks_enabled')='sandbox_only'
      and (select "state" from states where "key"='digital_sales_enabled')='sandbox_only'
      and (select "state" from states where "key"='creator_monetization_enabled') in ('sandbox_only','on')
      and (select "state" from states where "key"='live_money_enabled')='off'
      and (select "state" from states where "key"='payouts_enabled')='off'
    then 'sandbox'
    when (select count(*) from states)=6
      and (select "state" from states where "key"='revenuecat_app_store_enabled')='on'
      and (select "state" from states where "key"='provider_webhooks_enabled')='on'
      and (select "state" from states where "key"='digital_sales_enabled')='on'
      and (select "state" from states where "key"='creator_monetization_enabled')='on'
      and (select "state" from states where "key"='live_money_enabled')='on'
    then 'production'
    else null
  end
$$;
revoke all on function public."ios_creator_money_expected_environment_internal"()
  from public,anon,authenticated,service_role;

-- Resolve one exact finite App Store mapping for an already-persisted intent.
-- This helper is used before the iOS predecessor is allowed to reuse/create an
-- intent, so a repriced offer or stale product slot cannot leave one pending
-- intent in place while a second provider product is issued for the same
-- buyer/source lane.
create or replace function public."ios_creator_money_store_mapping_id_internal"(
  p_intent_id uuid,
  p_concept text
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mapping_id uuid;
  v_mapping_count integer:=0;
begin
  if p_intent_id is null
    or p_concept not in (
      'paid_video','event_pass','vip_pass','channel_subscription'
    )
  then return null; end if;

  select count(*),min(mapping."id"::text)::uuid
  into v_mapping_count,v_mapping_id
  from public."money_purchase_intents" intent
  join public."monetization_product_store_mappings" mapping
    on mapping."product_id"=intent."product_id"
   and mapping."provider_product_id"=intent."provider_product_id"
  join public."monetization_products" product
    on product."id"=mapping."product_id"
  where intent."id"=p_intent_id
    and intent."provider"='revenuecat_app_store'
    and intent."product_type"=case p_concept
      when 'paid_video' then 'paid_content_access' else p_concept end
    and intent."amount_minor">0
    and lower(intent."currency")='usd'
    and mapping."concept"=p_concept
    and mapping."platform"='ios'
    and mapping."store"='app_store'
    and mapping."provider"='revenuecat_app_store'
    and mapping."reference_price_minor"=intent."amount_minor"
    and lower(mapping."reference_currency")=lower(intent."currency")
    and mapping."environment"=intent."environment"
    and mapping."status"=case intent."environment"
      when 'production' then 'active' else 'sandbox' end
    and mapping."unlocks_digital_access"
    and not mapping."grants_livekit_authority"
    and not mapping."creates_payable_balance"
    and product."product_key"=intent."product_key"
    and product."product_type"=case p_concept
      when 'paid_video' then 'paid_content_access' else p_concept end
    and intent."metadata"->>'store_mapping_id'=mapping."id"::text
    and (
      (p_concept='paid_video'
        and mapping."store_product_type"='consumable'
        and mapping."tier" in ('tier1','tier2','tier3','tier4')
        and mapping."provider_product_id"='com.chillywood.paidvideo.'||mapping."tier"
        and mapping."reference_price_minor"=case mapping."tier"
          when 'tier1' then 99 when 'tier2' then 299
          when 'tier3' then 499 when 'tier4' then 999 else -1 end)
      or (p_concept='event_pass'
        and mapping."store_product_type"='consumable'
        and mapping."tier" in ('tier1','tier2','tier3','tier4')
        and mapping."provider_product_id"='com.chillywood.eventpass.'||mapping."tier"
        and mapping."reference_price_minor"=case mapping."tier"
          when 'tier1' then 99 when 'tier2' then 299
          when 'tier3' then 499 when 'tier4' then 999 else -1 end)
      or (p_concept='vip_pass'
        and mapping."store_product_type"='consumable'
        and mapping."tier" in ('tier1','tier2','tier3','tier4')
        and mapping."provider_product_id"='com.chillywood.vip.'||mapping."tier"
        and mapping."reference_price_minor"=case mapping."tier"
          when 'tier1' then 99 when 'tier2' then 299
          when 'tier3' then 499 when 'tier4' then 999 else -1 end)
      or (p_concept='channel_subscription'
        and mapping."store_product_type"='auto_renewable_subscription'
        and mapping."reference_price_minor"=499
        and mapping."metadata"->>'slot_number' in (
          '1','2','3','4','5','6','7','8'
        )
        and mapping."tier"='slot'||(mapping."metadata"->>'slot_number')
        and mapping."provider_product_id"=
          'com.chillywood.channel.subscription.slot'||
          (mapping."metadata"->>'slot_number')
        and mapping."apple_subscription_group"=
          'chillywood_channel_slot_'||(mapping."metadata"->>'slot_number'))
    )
    and (
      intent."environment"<>'production'
      or (
        coalesce((mapping."metadata"->>'provider_proof')::boolean,false)
        and coalesce((mapping."metadata"->>'owner_release_approved')::boolean,false)
        and coalesce((mapping."metadata"->>'physical_device_proof')::boolean,false)
      )
    );
  if v_mapping_count<>1 then return null; end if;
  return v_mapping_id;
end;
$$;
revoke all on function public."ios_creator_money_store_mapping_id_internal"(
  uuid,text
) from public,anon,authenticated,service_role;

alter function public."create_ios_creator_money_purchase_intent"(
  text,uuid,integer,jsonb
) rename to "create_ios_creator_money_purchase_intent_pre_specialized_routing_closure";
alter function public."create_ios_creator_money_purchase_intent_pre_specialized_routing_closure"(
  text,uuid,integer,jsonb
) set search_path = '';
revoke all on function public."create_ios_creator_money_purchase_intent_pre_specialized_routing_closure"(
  text,uuid,integer,jsonb
) from public,anon,authenticated,service_role;

-- Paid Video was already routed to App Store tiers, but its older branch read
-- the six rail switches independently and only searched for a pending intent
-- in the newly selected environment. During a sandbox/production transition,
-- that could leave the old source-bound pending intent alive and issue a
-- second charge candidate. Preserve historical no-charge access, then lock and
-- validate the complete Paid Video rail and every pending store lane before
-- delegating to the source-authoritative predecessor.
create or replace function public."ios_paid_video_expected_environment_internal"()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with states as (
    select switch_row."key",switch_row."state"
    from public."platform_money_kill_switches" switch_row
    where switch_row."key" in (
      'revenuecat_app_store_enabled','provider_webhooks_enabled',
      'paid_content_enabled','creator_monetization_enabled',
      'live_money_enabled','payouts_enabled'
    )
  )
  select case
    when (select count(*) from states)=6
      and (select "state" from states where "key"='revenuecat_app_store_enabled')='sandbox_only'
      and (select "state" from states where "key"='provider_webhooks_enabled')='sandbox_only'
      and (select "state" from states where "key"='paid_content_enabled')='sandbox_only'
      and (select "state" from states where "key"='creator_monetization_enabled') in ('sandbox_only','on')
      and (select "state" from states where "key"='live_money_enabled')='off'
      and (select "state" from states where "key"='payouts_enabled')='off'
    then 'sandbox'
    when (select count(*) from states)=6
      and (select "state" from states where "key"='revenuecat_app_store_enabled')='on'
      and (select "state" from states where "key"='provider_webhooks_enabled')='on'
      and (select "state" from states where "key"='paid_content_enabled')='on'
      and (select "state" from states where "key"='creator_monetization_enabled')='on'
      and (select "state" from states where "key"='live_money_enabled')='on'
    then 'production'
    else null
  end
$$;
revoke all on function public."ios_paid_video_expected_environment_internal"()
  from public,anon,authenticated,service_role;

create or replace function public."create_ios_paid_video_purchase_intent_guard_internal"(
  p_source_id uuid,
  p_amount_minor integer,
  p_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_session jsonb:=public."wave1_session_authority_readback"();
  v_legal jsonb;
  v_identity jsonb;
  v_existing public."money_purchase_intents"%rowtype;
  v_pending public."money_purchase_intents"%rowtype;
  v_intent public."money_purchase_intents"%rowtype;
  v_result jsonb;
  v_expected_environment text;
  v_required_status text;
  v_creator uuid;
  v_price integer;
  v_currency text;
  v_pending_count integer:=0;
begin
  if v_user is null
    or v_session->>'state'<>'ACTIVE'
    or coalesce((v_session->>'restoreOnly')::boolean,false)
    or (v_session->>'userId')::uuid is distinct from v_user
    or nullif(v_session->>'sessionGeneration','') is null
    or nullif(v_session->>'sessionGeneration','') is distinct from
      nullif(auth.jwt()->>'session_id','')
    or public."is_account_access_restricted"(v_user::text)
  then raise exception 'buyer_session_authority_required'; end if;
  if p_source_id is null or coalesce(p_amount_minor,0)<=0 then
    raise exception 'paid_video_source_offer_not_available';
  end if;
  v_legal:=public."wave1_legal_requirements_readback"('account');
  if coalesce((v_legal->>'allAccepted')::boolean,false) is not true then
    raise exception 'buyer_account_legal_not_current';
  end if;
  perform public."creator_money_client_metadata_internal"(p_metadata);

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'creator-money-source-intent:'||v_user::text||':paid_content:'||
      p_source_id::text,0
  ));

  -- Immutable exact history is no-charge authority and remains usable when a
  -- future-sale rail or mutable offer is paused. Revalidate every returned
  -- identity field instead of trusting the predecessor's JSON shape.
  begin
    v_identity:=public."creator_video_existing_purchase_identity_internal"(
      v_user,p_source_id
    );
  exception when others then
    v_identity:=null;
  end;
  if v_identity is not null then
    select intent.* into v_existing
    from public."money_purchase_intents" intent
    where intent."id"=(v_identity->>'id')::uuid;
    if v_existing."id" is null
      or v_existing."user_id" is distinct from v_user
      or v_existing."product_type"<>'paid_content_access'
      or v_existing."source_type"<>'paid_content'
      or v_existing."source_id" is distinct from p_source_id
      or v_existing."creator_id" is null
      or v_existing."provider" not in (
        'revenuecat_app_store','revenuecat_google_play'
      )
      or v_existing."provider" is distinct from v_identity->>'provider'
      or v_existing."provider_product_id" is distinct from
        v_identity->>'providerProductId'
      or v_existing."environment" is distinct from v_identity->>'environment'
      or v_existing."status"<>'consumed'
      or v_existing."amount_minor"<=0
      or lower(v_existing."currency")!~'^[a-z]{3}$'
    then raise exception 'existing_paid_video_identity_invalid'; end if;
    return public."money_purchase_intent_safe_row"(v_existing)
      ||jsonb_build_object(
        'alreadyPurchased',true,'concept','paid_video',
        'providerProductId',v_existing."provider_product_id",
        'environment',v_existing."environment"
      );
  end if;

  -- Hold every switch row through the predecessor call so environment cannot
  -- change between stale-intent validation and issuance.
  perform 1
  from public."platform_money_kill_switches" switch_row
  where switch_row."key" in (
    'revenuecat_app_store_enabled','provider_webhooks_enabled',
    'paid_content_enabled','creator_monetization_enabled',
    'live_money_enabled','payouts_enabled'
  )
  order by switch_row."key"
  for share;
  v_expected_environment:=
    public."ios_paid_video_expected_environment_internal"();
  if v_expected_environment is null then
    raise exception 'ios_creator_money_disabled';
  end if;
  v_required_status:=case v_expected_environment
    when 'production' then 'active' else 'sandbox' end;

  select price."creator_id",price."price_cents",lower(price."currency")
  into v_creator,v_price,v_currency
  from public."creator_content_prices" price
  where price."content_type"='creator_video'
    and price."content_id"=p_source_id
    and price."is_paid"
    and price."status"=v_required_status
  order by price."updated_at" desc,price."id" desc
  limit 1
  for key share;
  if v_creator is null
    or v_price is distinct from p_amount_minor
    or v_currency<>'usd'
  then raise exception 'paid_video_source_offer_not_available'; end if;

  select count(*) into v_pending_count
  from public."money_purchase_intents" pending
  where pending."user_id"=v_user
    and pending."source_type"='paid_content'
    and pending."source_id"=p_source_id
    and pending."status"='pending'
    and pending."expires_at">timezone('utc'::text,now());
  if v_pending_count>1 then
    raise exception 'source_purchase_intent_ambiguous';
  elsif v_pending_count=1 then
    select pending.* into v_pending
    from public."money_purchase_intents" pending
    where pending."user_id"=v_user
      and pending."source_type"='paid_content'
      and pending."source_id"=p_source_id
      and pending."status"='pending'
      and pending."expires_at">timezone('utc'::text,now())
    limit 1 for update;
    if v_pending."creator_id" is distinct from v_creator
      or v_pending."provider"<>'revenuecat_app_store'
      or v_pending."session_generation" is distinct from
        v_session->>'sessionGeneration'
      or v_pending."product_type"<>'paid_content_access'
      or v_pending."amount_minor" is distinct from v_price
      or lower(v_pending."currency")<>v_currency
      or v_pending."environment" is distinct from v_expected_environment
      or public."ios_creator_money_store_mapping_id_internal"(
        v_pending."id",'paid_video'
      ) is null
    then raise exception 'source_purchase_intent_already_pending'; end if;
  end if;

  v_result:=public."create_ios_creator_money_purchase_intent_pre_specialized_routing_closure"(
    'paid_video',p_source_id,p_amount_minor,p_metadata
  );
  if v_result->'alreadyPurchased' is distinct from 'false'::jsonb
    or coalesce(v_result->>'id','')
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then raise exception 'purchase_intent_response_identity_invalid'; end if;
  select intent.* into v_intent
  from public."money_purchase_intents" intent
  where intent."id"=(v_result->>'id')::uuid;
  if v_intent."id" is null
    or v_intent."user_id" is distinct from v_user
    or v_intent."source_type"<>'paid_content'
    or v_intent."source_id" is distinct from p_source_id
    or v_intent."creator_id" is distinct from v_creator
    or v_intent."provider"<>'revenuecat_app_store'
    or v_intent."provider_product_id" is distinct from
      v_result->>'providerProductId'
    or v_intent."environment" is distinct from v_expected_environment
    or v_intent."status"<>'pending'
    or v_intent."expires_at"<=timezone('utc'::text,now())
    or v_intent."session_generation" is distinct from
      v_session->>'sessionGeneration'
    or v_intent."amount_minor" is distinct from v_price
    or lower(v_intent."currency")<>v_currency
    or v_intent."product_type"<>'paid_content_access'
    or v_intent."metadata"->>'concept' is distinct from 'paid_video'
    or coalesce((v_intent."metadata"->>'not_payable')::boolean,false) is not true
    or coalesce((v_intent."metadata"->>'viewer_access_only')::boolean,false) is not true
    or coalesce((v_intent."metadata"->>'grants_livekit_authority')::boolean,true) is not false
    or coalesce((v_intent."metadata"->>'grants_host_authority')::boolean,true) is not false
    or coalesce((v_intent."metadata"->>'premium_unlock')::boolean,true) is not false
    or coalesce((v_intent."metadata"->>'payout_ready')::boolean,true) is not false
    or public."ios_creator_money_store_mapping_id_internal"(
      v_intent."id",'paid_video'
    ) is null
  then raise exception 'purchase_intent_response_identity_invalid'; end if;
  return public."money_purchase_intent_safe_row"(v_intent)
    ||jsonb_build_object(
      'alreadyPurchased',false,'concept','paid_video',
      'providerProductId',v_intent."provider_product_id",
      'environment',v_intent."environment",
      'storeMappingId',v_intent."metadata"->>'store_mapping_id'
    );
end;
$$;
revoke all on function public."create_ios_paid_video_purchase_intent_guard_internal"(
  uuid,integer,jsonb
) from public,anon,authenticated,service_role;

create or replace function public."create_ios_creator_money_purchase_intent"(
  p_concept text,
  p_source_id uuid,
  p_amount_minor integer,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_session jsonb:=public."wave1_session_authority_readback"();
  v_legal jsonb;
  v_concept text:=lower(pg_catalog.btrim(coalesce(p_concept,'')));
  v_source_type text;
  v_creator uuid;
  v_creator_count integer:=0;
  v_access jsonb;
  v_historical jsonb;
  v_result jsonb;
  v_intent public."money_purchase_intents"%rowtype;
  v_pending public."money_purchase_intents"%rowtype;
  v_mapping public."monetization_product_store_mappings"%rowtype;
  v_mapping_count integer:=0;
  v_required_status text;
  v_expected_environment text;
  v_expected_false_key text;
begin
  if v_concept='paid_video' then
    return public."create_ios_paid_video_purchase_intent_guard_internal"(
      p_source_id,p_amount_minor,p_metadata
    );
  end if;
  if v_concept not in ('event_pass','vip_pass','channel_subscription')
    or p_source_id is null or coalesce(p_amount_minor,0)<=0
  then
    raise exception 'ios_creator_money_concept_invalid';
  end if;
  if v_user is null
    or v_session->>'state'<>'ACTIVE'
    or coalesce((v_session->>'restoreOnly')::boolean,false)
    or (v_session->>'userId')::uuid is distinct from v_user
    or nullif(v_session->>'sessionGeneration','') is null
    or nullif(v_session->>'sessionGeneration','') is distinct from
      nullif(auth.jwt()->>'session_id','')
    or public."is_account_access_restricted"(v_user::text)
  then
    raise exception 'buyer_session_authority_required';
  end if;
  v_legal:=public."wave1_legal_requirements_readback"('account');
  if coalesce((v_legal->>'allAccepted')::boolean,false) is not true then
    raise exception 'buyer_account_legal_not_current';
  end if;
  -- Validate and size-limit metadata even when the request resolves to an
  -- already-owned no-charge response.
  perform public."creator_money_client_metadata_internal"(p_metadata);

  if v_concept='event_pass' then
    select count(distinct offer."creator_id"),
      min(offer."creator_id"::text)::uuid
    into v_creator_count,v_creator
    from public."paid_creator_events" offer
    where offer."creator_event_id"=p_source_id;
    v_source_type:='event';
    v_expected_false_key:='alreadyPurchased';
    if v_creator_count=1 then
      v_access:=public."resolve_paid_creator_event_pass_access"(p_source_id);
    end if;
  elsif v_concept='vip_pass' then
    select offer."creator_id" into v_creator
    from public."creator_vip_pass_offers" offer
    where offer."id"=p_source_id;
    v_source_type:='vip_pass';
    v_expected_false_key:='alreadyPurchased';
    if v_creator is not null then
      v_access:=public."resolve_creator_vip_pass_access"(v_creator);
    end if;
  else
    select offer."creator_id" into v_creator
    from public."creator_channel_subscription_offers" offer
    where offer."id"=p_source_id;
    v_source_type:='channel_subscription';
    v_expected_false_key:='alreadySubscribed';
    if v_creator is not null then
      v_access:=public."resolve_creator_channel_subscription_access"(v_creator);
    end if;
  end if;
  if v_creator is null or (v_concept='event_pass' and v_creator_count<>1) then
    raise exception 'ios_creator_money_source_offer_not_available';
  end if;

  if coalesce((v_access->>'allowed')::boolean,false)
    and (
      (v_concept='event_pass' and v_access->>'reason'='event_pass_confirmed')
      or (v_concept='vip_pass' and v_access->>'reason'='vip_active')
      or (v_concept='channel_subscription'
        and v_access->>'reason' in (
          'subscription_active','subscription_cancel_pending'
        ))
    )
  then
    v_historical:=public."creator_money_historical_intent_safe_row_internal"(
      v_user,v_concept,p_source_id,v_creator
    );
    return v_historical||jsonb_build_object(
      v_expected_false_key,true,'concept',v_concept,
      'providerProductId',v_historical->>'providerProductId',
      'environment',v_historical->>'environment'
    );
  end if;

  -- Serialize every store lane for this exact buyer/source. A pending Google
  -- intent and a pending App Store intent must never coexist and invite two
  -- concurrent charges for one entitlement.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'creator-money-source-intent:'||v_user::text||':'||v_source_type||':'||
      p_source_id::text,0
  ));
  -- Keep the complete rail stable through pending-intent validation and the
  -- predecessor call that selects the provider environment.
  perform 1
  from public."platform_money_kill_switches" switch_row
  where switch_row."key" in (
    'revenuecat_app_store_enabled','provider_webhooks_enabled',
    'digital_sales_enabled','creator_monetization_enabled',
    'live_money_enabled','payouts_enabled'
  )
  order by switch_row."key"
  for share;
  v_expected_environment:=
    public."ios_creator_money_expected_environment_internal"();
  if v_expected_environment is null then
    raise exception 'ios_creator_money_disabled';
  end if;
  select count(*) into v_mapping_count
  from public."money_purchase_intents" pending
  where pending."user_id"=v_user
    and pending."source_type"=v_source_type
    and pending."source_id"=p_source_id
    and pending."status"='pending'
    and pending."expires_at">timezone('utc'::text,now());
  if v_mapping_count>1 then
    raise exception 'source_purchase_intent_ambiguous';
  elsif v_mapping_count=1 then
    select pending.* into v_pending
    from public."money_purchase_intents" pending
    where pending."user_id"=v_user
      and pending."source_type"=v_source_type
      and pending."source_id"=p_source_id
      and pending."status"='pending'
      and pending."expires_at">timezone('utc'::text,now())
    limit 1 for update;
    if v_pending."creator_id" is distinct from v_creator
      or v_pending."provider"<>'revenuecat_app_store'
      or v_pending."session_generation" is distinct from
        v_session->>'sessionGeneration'
      or v_pending."product_type" is distinct from v_concept
      or v_pending."amount_minor" is distinct from p_amount_minor
      or lower(v_pending."currency")<>'usd'
      or v_pending."environment" is distinct from v_expected_environment
      or public."ios_creator_money_store_mapping_id_internal"(
        v_pending."id",v_concept
      ) is null
    then
      raise exception 'source_purchase_intent_already_pending';
    end if;
  end if;

  v_result:=public."create_ios_creator_money_purchase_intent_pre_specialized_routing_closure"(
    v_concept,p_source_id,p_amount_minor,p_metadata
  );
  if v_result->v_expected_false_key is distinct from 'false'::jsonb
    or coalesce(v_result->>'id','')
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    raise exception 'purchase_intent_response_identity_invalid';
  end if;
  select intent.* into v_intent
  from public."money_purchase_intents" intent
  where intent."id"=(v_result->>'id')::uuid;
  if v_intent."id" is null
    or v_intent."user_id" is distinct from v_user
    or v_intent."source_type" is distinct from v_source_type
    or v_intent."source_id" is distinct from p_source_id
    or v_intent."creator_id" is distinct from v_creator
    or v_intent."provider"<>'revenuecat_app_store'
    or v_intent."provider_product_id" is distinct from
      v_result->>'providerProductId'
    or v_intent."environment" not in ('sandbox','production')
    or v_intent."environment" is distinct from v_expected_environment
    or v_intent."status"<>'pending'
    or v_intent."expires_at"<=timezone('utc'::text,now())
    or v_intent."session_generation" is distinct from
      v_session->>'sessionGeneration'
    or v_intent."amount_minor" is distinct from p_amount_minor
    or lower(v_intent."currency")<>'usd'
    or v_intent."product_type" is distinct from v_concept
    or v_intent."metadata"->>'concept' is distinct from v_concept
    or coalesce((v_intent."metadata"->>'not_payable')::boolean,false) is not true
    or coalesce((v_intent."metadata"->>'viewer_access_only')::boolean,false) is not true
    or coalesce((v_intent."metadata"->>'grants_livekit_authority')::boolean,true) is not false
    or coalesce((v_intent."metadata"->>'grants_host_authority')::boolean,true) is not false
    or coalesce((v_intent."metadata"->>'premium_unlock')::boolean,true) is not false
    or coalesce((v_intent."metadata"->>'payout_ready')::boolean,true) is not false
  then
    raise exception 'purchase_intent_response_identity_invalid';
  end if;
  v_required_status:=case v_intent."environment"
    when 'production' then 'active' else 'sandbox' end;

  if v_concept='event_pass' and not exists (
    select 1
    from public."paid_creator_events" offer
    join public."creator_events" event
      on event."id"=offer."creator_event_id"
    where offer."creator_event_id"=p_source_id
      and offer."creator_id"=v_creator
      and offer."price_cents"=v_intent."amount_minor"
      and lower(offer."currency")=lower(v_intent."currency")
      and offer."status"=v_required_status
      and event."status" not in (
        'ended','expired','canceled','removed','unsafe','blocked'
      )
  ) then
    raise exception 'purchase_intent_response_identity_invalid';
  elsif v_concept='vip_pass' and not exists (
    select 1 from public."creator_vip_pass_offers" offer
    where offer."id"=p_source_id and offer."creator_id"=v_creator
      and offer."price_cents"=v_intent."amount_minor"
      and lower(offer."currency")=lower(v_intent."currency")
      and offer."status"=v_required_status
  ) then
    raise exception 'purchase_intent_response_identity_invalid';
  elsif v_concept='channel_subscription' and not exists (
    select 1 from public."creator_channel_subscription_offers" offer
    where offer."id"=p_source_id and offer."creator_id"=v_creator
      and offer."price_cents"=v_intent."amount_minor"
      and lower(offer."currency")=lower(v_intent."currency")
      and offer."status"=v_required_status
  ) then
    raise exception 'purchase_intent_response_identity_invalid';
  end if;

  select count(*) into v_mapping_count
  from public."monetization_product_store_mappings" mapping
  join public."monetization_products" product
    on product."id"=mapping."product_id"
  where mapping."concept"=v_concept
    and mapping."platform"='ios'
    and mapping."store"='app_store'
    and mapping."provider"='revenuecat_app_store'
    and mapping."provider_product_id"=v_intent."provider_product_id"
    and mapping."product_id"=v_intent."product_id"
    and mapping."reference_price_minor"=v_intent."amount_minor"
    and lower(mapping."reference_currency")=lower(v_intent."currency")
    and mapping."environment"=v_intent."environment"
    and mapping."status"=v_required_status
    and mapping."unlocks_digital_access"
    and not mapping."grants_livekit_authority"
    and not mapping."creates_payable_balance"
    and product."product_key"=v_intent."product_key"
    and product."product_type"=v_concept
    and (
      (v_concept='event_pass'
        and mapping."store_product_type"='consumable'
        and mapping."tier" in ('tier1','tier2','tier3','tier4')
        and mapping."provider_product_id"='com.chillywood.eventpass.'||mapping."tier"
        and mapping."reference_price_minor"=case mapping."tier"
          when 'tier1' then 99 when 'tier2' then 299
          when 'tier3' then 499 when 'tier4' then 999 else -1 end)
      or (v_concept='vip_pass'
        and mapping."store_product_type"='consumable'
        and mapping."tier" in ('tier1','tier2','tier3','tier4')
        and mapping."provider_product_id"='com.chillywood.vip.'||mapping."tier"
        and mapping."reference_price_minor"=case mapping."tier"
          when 'tier1' then 99 when 'tier2' then 299
          when 'tier3' then 499 when 'tier4' then 999 else -1 end)
      or (v_concept='channel_subscription'
        and mapping."store_product_type"='auto_renewable_subscription'
        and mapping."reference_price_minor"=499
        and mapping."metadata"->>'slot_number' in (
          '1','2','3','4','5','6','7','8'
        )
        and mapping."tier"='slot'||(mapping."metadata"->>'slot_number')
        and mapping."provider_product_id"=
          'com.chillywood.channel.subscription.slot'||
          (mapping."metadata"->>'slot_number')
        and mapping."apple_subscription_group"=
          'chillywood_channel_slot_'||(mapping."metadata"->>'slot_number'))
    )
    and (
      v_intent."environment"<>'production'
      or (
        coalesce((mapping."metadata"->>'provider_proof')::boolean,false)
        and coalesce((mapping."metadata"->>'owner_release_approved')::boolean,false)
        and coalesce((mapping."metadata"->>'physical_device_proof')::boolean,false)
      )
    );
  if v_mapping_count<>1 then
    raise exception 'purchase_intent_response_identity_invalid';
  end if;
  select mapping.* into v_mapping
  from public."monetization_product_store_mappings" mapping
  join public."monetization_products" product
    on product."id"=mapping."product_id"
  where mapping."concept"=v_concept
    and mapping."platform"='ios'
    and mapping."store"='app_store'
    and mapping."provider"='revenuecat_app_store'
    and mapping."provider_product_id"=v_intent."provider_product_id"
    and mapping."product_id"=v_intent."product_id"
  limit 1;
  if v_mapping."id" is null
    or v_intent."metadata"->>'store_mapping_id' is distinct from
      v_mapping."id"::text
  then
    raise exception 'purchase_intent_response_identity_invalid';
  end if;
  return public."money_purchase_intent_safe_row"(v_intent)
    ||jsonb_build_object(
      v_expected_false_key,false,'concept',v_concept,
      'providerProductId',v_intent."provider_product_id",
      'environment',v_intent."environment",
      'storeMappingId',v_mapping."id"
    );
end;
$$;
revoke all on function public."create_ios_creator_money_purchase_intent"(
  text,uuid,integer,jsonb
) from public,anon;
grant execute on function public."create_ios_creator_money_purchase_intent"(
  text,uuid,integer,jsonb
) to authenticated,service_role;

alter function public."create_paid_creator_event_pass_purchase_intent"(uuid)
  rename to "create_paid_creator_event_pass_purchase_intent_pre_ios_routing_closure";
alter function public."create_creator_vip_pass_purchase_intent"(uuid)
  rename to "create_creator_vip_pass_purchase_intent_pre_ios_routing_closure";
alter function public."create_creator_channel_subscription_purchase_intent"(uuid)
  rename to "create_creator_channel_subscription_purchase_intent_pre_ios_routing_closure";

create or replace function public."create_paid_creator_event_pass_purchase_intent"(
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_session jsonb:=public."wave1_session_authority_readback"();
  v_headers jsonb:=case
    when nullif(current_setting('request.headers',true),'') is null then '{}'::jsonb
    else current_setting('request.headers',true)::jsonb end;
  v_platform text:=lower(pg_catalog.btrim(coalesce(
    v_headers->>'x-chillywood-platform',''
  )));
  v_offer public."paid_creator_events"%rowtype;
  v_pending public."money_purchase_intents"%rowtype;
  v_pending_count integer:=0;
begin
  if v_user is null
    or v_session->>'state'<>'ACTIVE'
    or coalesce((v_session->>'restoreOnly')::boolean,false)
    or (v_session->>'userId')::uuid is distinct from v_user
    or nullif(v_session->>'sessionGeneration','') is distinct from
      nullif(auth.jwt()->>'session_id','')
    or public."is_account_access_restricted"(v_user::text)
  then raise exception 'buyer_session_authority_required'; end if;
  if v_platform not in ('ios','android') then
    raise exception 'creator_money_client_platform_invalid';
  end if;
  select offer.* into v_offer from public."paid_creator_events" offer
  where offer."id"=p_event_id;
  if v_offer."id" is null then raise exception 'offer_not_found'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'creator-money-source-intent:'||v_user::text||':event:'||
      v_offer."creator_event_id"::text,0
  ));
  select count(*) into v_pending_count
  from public."money_purchase_intents" pending
  where pending."user_id"=v_user and pending."source_type"='event'
    and pending."source_id"=v_offer."creator_event_id"
    and pending."status"='pending'
    and pending."expires_at">timezone('utc'::text,now());
  if v_pending_count>1 then raise exception 'source_purchase_intent_ambiguous'; end if;
  if v_pending_count=1 then
    select pending.* into v_pending
    from public."money_purchase_intents" pending
    where pending."user_id"=v_user and pending."source_type"='event'
      and pending."source_id"=v_offer."creator_event_id"
      and pending."status"='pending'
      and pending."expires_at">timezone('utc'::text,now())
    limit 1 for update;
    if v_pending."creator_id" is distinct from v_offer."creator_id"
      or v_pending."session_generation" is distinct from
        v_session->>'sessionGeneration'
      or (v_platform='ios' and v_pending."provider"<>'revenuecat_app_store')
      or (v_platform='android' and v_pending."provider"<>'revenuecat_google_play')
      or (v_platform='ios' and (
        v_pending."product_type"<>'event_pass'
        or v_pending."amount_minor" is distinct from v_offer."price_cents"
        or lower(v_pending."currency")<>lower(v_offer."currency")
        or v_pending."environment" is distinct from
          public."ios_creator_money_expected_environment_internal"()
        or public."ios_creator_money_store_mapping_id_internal"(
          v_pending."id",'event_pass'
        ) is null
      ))
    then raise exception 'source_purchase_intent_already_pending'; end if;
    if v_platform='android' then
      if v_offer."status"<>'sandbox'
        or v_pending."provider_product_id" is distinct from v_offer."provider_product_id"
        or v_pending."product_type"<>'event_pass'
        or v_pending."amount_minor" is distinct from v_offer."price_cents"
        or lower(v_pending."currency")<>lower(v_offer."currency")
        or v_pending."environment"<>'sandbox'
      then raise exception 'purchase_intent_response_identity_invalid'; end if;
      return public."money_purchase_intent_safe_row"(v_pending)
        ||jsonb_build_object('alreadyPurchased',false);
    end if;
  end if;
  if v_platform='ios' then
    return public."create_ios_creator_money_purchase_intent"(
      'event_pass',v_offer."creator_event_id",v_offer."price_cents",
      jsonb_build_object('source_surface','paid_creator_event')
    );
  end if;
  return public."create_paid_creator_event_pass_purchase_intent_pre_ios_routing_closure"(
    p_event_id
  );
end;
$$;

create or replace function public."create_creator_vip_pass_purchase_intent"(
  p_offer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_session jsonb:=public."wave1_session_authority_readback"();
  v_headers jsonb:=case
    when nullif(current_setting('request.headers',true),'') is null then '{}'::jsonb
    else current_setting('request.headers',true)::jsonb end;
  v_platform text:=lower(pg_catalog.btrim(coalesce(
    v_headers->>'x-chillywood-platform',''
  )));
  v_offer public."creator_vip_pass_offers"%rowtype;
  v_pending public."money_purchase_intents"%rowtype;
  v_pending_count integer:=0;
begin
  if v_user is null
    or v_session->>'state'<>'ACTIVE'
    or coalesce((v_session->>'restoreOnly')::boolean,false)
    or (v_session->>'userId')::uuid is distinct from v_user
    or nullif(v_session->>'sessionGeneration','') is distinct from
      nullif(auth.jwt()->>'session_id','')
    or public."is_account_access_restricted"(v_user::text)
  then raise exception 'buyer_session_authority_required'; end if;
  if v_platform not in ('ios','android') then
    raise exception 'creator_money_client_platform_invalid';
  end if;
  select offer.* into v_offer from public."creator_vip_pass_offers" offer
  where offer."id"=p_offer_id;
  if v_offer."id" is null then raise exception 'offer_not_found'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'creator-money-source-intent:'||v_user::text||':vip_pass:'||
      v_offer."id"::text,0
  ));
  select count(*) into v_pending_count
  from public."money_purchase_intents" pending
  where pending."user_id"=v_user and pending."source_type"='vip_pass'
    and pending."source_id"=v_offer."id"
    and pending."status"='pending'
    and pending."expires_at">timezone('utc'::text,now());
  if v_pending_count>1 then raise exception 'source_purchase_intent_ambiguous'; end if;
  if v_pending_count=1 then
    select pending.* into v_pending
    from public."money_purchase_intents" pending
    where pending."user_id"=v_user and pending."source_type"='vip_pass'
      and pending."source_id"=v_offer."id"
      and pending."status"='pending'
      and pending."expires_at">timezone('utc'::text,now())
    limit 1 for update;
    if v_pending."creator_id" is distinct from v_offer."creator_id"
      or v_pending."session_generation" is distinct from
        v_session->>'sessionGeneration'
      or (v_platform='ios' and v_pending."provider"<>'revenuecat_app_store')
      or (v_platform='android' and v_pending."provider"<>'revenuecat_google_play')
      or (v_platform='ios' and (
        v_pending."product_type"<>'vip_pass'
        or v_pending."amount_minor" is distinct from v_offer."price_cents"
        or lower(v_pending."currency")<>lower(v_offer."currency")
        or v_pending."environment" is distinct from
          public."ios_creator_money_expected_environment_internal"()
        or public."ios_creator_money_store_mapping_id_internal"(
          v_pending."id",'vip_pass'
        ) is null
      ))
    then raise exception 'source_purchase_intent_already_pending'; end if;
    if v_platform='android' then
      if v_offer."status"<>'sandbox'
        or v_pending."provider_product_id" is distinct from v_offer."provider_product_id"
        or v_pending."product_type"<>'vip_pass'
        or v_pending."amount_minor" is distinct from v_offer."price_cents"
        or lower(v_pending."currency")<>lower(v_offer."currency")
        or v_pending."environment"<>'sandbox'
      then raise exception 'purchase_intent_response_identity_invalid'; end if;
      return public."money_purchase_intent_safe_row"(v_pending)
        ||jsonb_build_object('alreadyPurchased',false);
    end if;
  end if;
  if v_platform='ios' then
    return public."create_ios_creator_money_purchase_intent"(
      'vip_pass',v_offer."id",v_offer."price_cents",
      jsonb_build_object('source_surface','creator_vip_pass')
    );
  end if;
  return public."create_creator_vip_pass_purchase_intent_pre_ios_routing_closure"(
    p_offer_id
  );
end;
$$;

create or replace function public."create_creator_channel_subscription_purchase_intent"(
  p_offer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_session jsonb:=public."wave1_session_authority_readback"();
  v_headers jsonb:=case
    when nullif(current_setting('request.headers',true),'') is null then '{}'::jsonb
    else current_setting('request.headers',true)::jsonb end;
  v_platform text:=lower(pg_catalog.btrim(coalesce(
    v_headers->>'x-chillywood-platform',''
  )));
  v_offer public."creator_channel_subscription_offers"%rowtype;
  v_pending public."money_purchase_intents"%rowtype;
  v_pending_count integer:=0;
begin
  if v_user is null
    or v_session->>'state'<>'ACTIVE'
    or coalesce((v_session->>'restoreOnly')::boolean,false)
    or (v_session->>'userId')::uuid is distinct from v_user
    or nullif(v_session->>'sessionGeneration','') is distinct from
      nullif(auth.jwt()->>'session_id','')
    or public."is_account_access_restricted"(v_user::text)
  then raise exception 'buyer_session_authority_required'; end if;
  if v_platform not in ('ios','android') then
    raise exception 'creator_money_client_platform_invalid';
  end if;
  select offer.* into v_offer
  from public."creator_channel_subscription_offers" offer
  where offer."id"=p_offer_id;
  if v_offer."id" is null then raise exception 'offer_not_found'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'creator-money-source-intent:'||v_user::text||':channel_subscription:'||
      v_offer."id"::text,0
  ));
  select count(*) into v_pending_count
  from public."money_purchase_intents" pending
  where pending."user_id"=v_user
    and pending."source_type"='channel_subscription'
    and pending."source_id"=v_offer."id"
    and pending."status"='pending'
    and pending."expires_at">timezone('utc'::text,now());
  if v_pending_count>1 then raise exception 'source_purchase_intent_ambiguous'; end if;
  if v_pending_count=1 then
    select pending.* into v_pending
    from public."money_purchase_intents" pending
    where pending."user_id"=v_user
      and pending."source_type"='channel_subscription'
      and pending."source_id"=v_offer."id"
      and pending."status"='pending'
      and pending."expires_at">timezone('utc'::text,now())
    limit 1 for update;
    if v_pending."creator_id" is distinct from v_offer."creator_id"
      or v_pending."session_generation" is distinct from
        v_session->>'sessionGeneration'
      or (v_platform='ios' and v_pending."provider"<>'revenuecat_app_store')
      or (v_platform='android' and v_pending."provider"<>'revenuecat_google_play')
      or (v_platform='ios' and (
        v_pending."product_type"<>'channel_subscription'
        or v_pending."amount_minor" is distinct from v_offer."price_cents"
        or lower(v_pending."currency")<>lower(v_offer."currency")
        or v_pending."environment" is distinct from
          public."ios_creator_money_expected_environment_internal"()
        or public."ios_creator_money_store_mapping_id_internal"(
          v_pending."id",'channel_subscription'
        ) is null
      ))
    then raise exception 'source_purchase_intent_already_pending'; end if;
    if v_platform='android' then
      if v_offer."status"<>'sandbox'
        or v_pending."provider_product_id" is distinct from v_offer."provider_product_id"
        or v_pending."product_type"<>'channel_subscription'
        or v_pending."amount_minor" is distinct from v_offer."price_cents"
        or lower(v_pending."currency")<>lower(v_offer."currency")
        or v_pending."environment"<>'sandbox'
      then raise exception 'purchase_intent_response_identity_invalid'; end if;
      return public."money_purchase_intent_safe_row"(v_pending)
        ||jsonb_build_object('alreadySubscribed',false);
    end if;
  end if;
  if v_platform='ios' then
    return public."create_ios_creator_money_purchase_intent"(
      'channel_subscription',v_offer."id",v_offer."price_cents",
      jsonb_build_object('source_surface','creator_channel_subscription')
    );
  end if;
  return public."create_creator_channel_subscription_purchase_intent_pre_ios_routing_closure"(
    p_offer_id
  );
end;
$$;

alter function public."create_paid_creator_event_pass_purchase_intent_pre_ios_routing_closure"(
  uuid
) set search_path = '';
alter function public."create_creator_vip_pass_purchase_intent_pre_ios_routing_closure"(
  uuid
) set search_path = '';
alter function public."create_creator_channel_subscription_purchase_intent_pre_ios_routing_closure"(
  uuid
) set search_path = '';
revoke all on function public."create_paid_creator_event_pass_purchase_intent_pre_ios_routing_closure"(
  uuid
) from public,anon,authenticated,service_role;
revoke all on function public."create_creator_vip_pass_purchase_intent_pre_ios_routing_closure"(
  uuid
) from public,anon,authenticated,service_role;
revoke all on function public."create_creator_channel_subscription_purchase_intent_pre_ios_routing_closure"(
  uuid
) from public,anon,authenticated,service_role;
revoke all on function public."create_paid_creator_event_pass_purchase_intent"(uuid)
  from public,anon;
revoke all on function public."create_creator_vip_pass_purchase_intent"(uuid)
  from public,anon;
revoke all on function public."create_creator_channel_subscription_purchase_intent"(uuid)
  from public,anon;
grant execute on function public."create_paid_creator_event_pass_purchase_intent"(uuid)
  to authenticated,service_role;
grant execute on function public."create_creator_vip_pass_purchase_intent"(uuid)
  to authenticated,service_role;
grant execute on function public."create_creator_channel_subscription_purchase_intent"(uuid)
  to authenticated,service_role;

comment on function public."create_ios_creator_money_purchase_intent"(
  text,uuid,integer,jsonb
) is 'Exact-session creator-money App Store intent. Event/VIP/Channel responses are validated against one exact finite mapping; historical no-charge responses remain exact-source and immutable-provider bound.';
