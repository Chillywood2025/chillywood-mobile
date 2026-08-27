-- Close the reconciled VIP/Paid Video authority gap before any source-bearing
-- row, rendition metadata, storage object, or signed playback path is exposed.
-- Public card/thumbnail discovery remains a separate, non-source surface.

-- This helper is deliberately internal and must only be called after the
-- caller's owner/public/VIP/Paid authority has been established. Keeping the
-- source-bearing read in a separate function makes authorization-before-read
-- ordering explicit and mechanically reviewable.
create or replace function public."creator_video_playable_source_after_authority_internal"(
  p_video_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public."videos" video
    where video."id"=p_video_id
      and video."quarantined_at" is null
      and public."media_scan_public_safe"(video."scan_status")
      and public."is_creator_video_playable_source"(
        video."storage_path",video."storage_object_key",video."playback_url"
      )
  );
$$;
revoke all on function public."creator_video_playable_source_after_authority_internal"(uuid)
  from public,anon,authenticated,service_role;

-- Paid Video uses one creator-authored price offer across Android and iOS. A
-- completed purchase is resolved from its immutable intent, provider event,
-- transaction binding, grant, and quoted ledger entry. Current catalog or
-- mapping state governs only a future sale: retiring a SKU must not revoke an
-- exact nonrefunded purchase or invite a duplicate charge.
create or replace function public."creator_video_existing_purchase_identity_internal"(
  p_user_id uuid,
  p_video_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_count integer:=0;
  v_intent_id uuid;
  v_access_grant_id uuid;
  v_provider text;
  v_provider_product_id text;
  v_environment text;
begin
  if p_user_id is null or p_video_id is null then
    raise exception 'existing_paid_video_identity_invalid';
  end if;

  with candidates as (
    select distinct
      intent."id",grant_row."id" as access_grant_id,intent."provider",
      intent."provider_product_id",intent."environment"
    from public."access_grants" grant_row
    join public."provider_events" provider_event
      on provider_event."id"=grant_row."provider_event_id"
     and provider_event."provider"=grant_row."provider"
     and provider_event."provider" in ('revenuecat_app_store','revenuecat_google_play')
     and provider_event."user_id"=p_user_id
     and provider_event."product_id"=grant_row."product_id"
     and provider_event."product_key"=grant_row."metadata"->>'product_key'
     and provider_event."environment"=grant_row."environment"
     and provider_event."status"='processed'
    join public."money_purchase_intents" intent
      on intent."id"::text=grant_row."metadata"->>'purchase_intent_id'
     and intent."user_id"=p_user_id
     and intent."product_id"=grant_row."product_id"
     and intent."product_key"=provider_event."product_key"
     and intent."product_type"='paid_content_access'
     and intent."source_type"='paid_content'
     and intent."source_id"=p_video_id
     and intent."provider"=provider_event."provider"
     and intent."provider_product_id"=provider_event."metadata"->>'provider_product_id'
     and intent."provider_product_id"=grant_row."metadata"->>'provider_product_id'
     and intent."environment"=provider_event."environment"
     and intent."environment"=grant_row."environment"
     and intent."status"='consumed'
    join public."revenuecat_consumable_transaction_intents" transaction_link
      on transaction_link."purchase_intent_id"=intent."id"
     and transaction_link."provider"=provider_event."provider"
     and transaction_link."user_id"=p_user_id
     and transaction_link."product_id"=intent."product_id"
     and transaction_link."original_transaction_id"=grant_row."metadata"->>'original_transaction_id'
     and transaction_link."original_transaction_id"=provider_event."metadata"->>'original_transaction_id'
     and transaction_link."last_provider_event_id"=provider_event."id"
     and transaction_link."last_event_type"=provider_event."event_type"
     and transaction_link."last_occurred_at"=provider_event."occurred_at"
     and transaction_link."binding_state"='exact'
     and not transaction_link."terminal"
    join public."videos" video
      on video."id"=p_video_id
     and video."owner_id"=intent."creator_id"
    where grant_row."user_id"=p_user_id
      and grant_row."grant_type"='paid_content_access'
      and grant_row."source_type"='provider_event'
      and grant_row."source_id"=p_video_id
      and ((grant_row."status"='active' and grant_row."environment"='production')
        or (grant_row."status"='sandbox_only' and grant_row."environment"='sandbox'))
      and grant_row."starts_at"<=timezone('utc'::text,now())
      and (grant_row."expires_at" is null or grant_row."expires_at">timezone('utc'::text,now()))
      and grant_row."refunded_at" is null
      and grant_row."revoked_at" is null
      and provider_event."metadata"->>'purchase_intent_id'=intent."id"::text
      and provider_event."metadata"->>'access_grant_id'=grant_row."id"::text
      and nullif(pg_catalog.btrim(coalesce(
        provider_event."metadata"->>'original_transaction_id',''
      )),'') is not null
      and exists (
        select 1 from public."money_access_ledger_events" purchase_ledger
        where purchase_ledger."provider_event_id"=provider_event."id"
          and purchase_ledger."user_id"=p_user_id
          and purchase_ledger."creator_id"=intent."creator_id"
          and purchase_ledger."product_id"=intent."product_id"
          and purchase_ledger."source_type"=intent."source_type"
          and purchase_ledger."source_id"=intent."source_id"
          and purchase_ledger."event_type" in (
            'INITIAL_PURCHASE','NON_RENEWING_PURCHASE','RENEWAL',
            'UNCANCELLATION','PRODUCT_CHANGE'
          )
          and purchase_ledger."status" in ('verified','sandbox_only')
          and purchase_ledger."metadata"->>'purchase_intent_id'=intent."id"::text
          and purchase_ledger."metadata"->>'original_transaction_id'
            =provider_event."metadata"->>'original_transaction_id'
          and coalesce(purchase_ledger."metadata"->>'reference_price_minor','')
            ~ '^[1-9][0-9]*$'
          and (purchase_ledger."metadata"->>'reference_price_minor')::integer
            =intent."amount_minor"
          and lower(coalesce(
            purchase_ledger."metadata"->>'reference_currency',''
          ))=lower(intent."currency")
      )
      and not public."revenuecat_authority_quarantined_internal"(
        provider_event."provider",p_user_id,provider_event."environment"
      )
  )
  select count(*),min(candidate."id"::text)::uuid,
    min(candidate."access_grant_id"::text)::uuid,min(candidate."provider"),
    min(candidate."provider_product_id"),min(candidate."environment")
  into v_count,v_intent_id,v_access_grant_id,v_provider,
    v_provider_product_id,v_environment
  from candidates candidate;

  if v_count=0 then raise exception 'existing_paid_video_identity_missing'; end if;
  if v_count<>1 then raise exception 'existing_paid_video_identity_ambiguous'; end if;
  if v_intent_id is null or v_access_grant_id is null
    or v_provider not in ('revenuecat_app_store','revenuecat_google_play')
    or nullif(pg_catalog.btrim(coalesce(v_provider_product_id,'')),'') is null
  then
    raise exception 'existing_paid_video_identity_invalid';
  end if;
  return jsonb_build_object(
    'id',v_intent_id,'accessGrantId',v_access_grant_id,
    'provider',v_provider,'providerProductId',v_provider_product_id,
    'environment',v_environment
  );
end;
$$;
revoke all on function public."creator_video_existing_purchase_identity_internal"(uuid,uuid)
  from public,anon,authenticated,service_role;

alter function public."resolve_paid_watch_party_ticket_access"(text)
  rename to "resolve_paid_watch_party_ticket_access_pre_historical_closeout";
revoke all on function public."resolve_paid_watch_party_ticket_access_pre_historical_closeout"(text)
  from public,anon,authenticated,service_role;
create or replace function public."resolve_paid_watch_party_ticket_access"(p_party_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_room public."watch_party_rooms"%rowtype;
  v_offer public."paid_watch_party_offers"%rowtype;
  v_ticket public."paid_watch_party_tickets"%rowtype;
  v_identity jsonb;
begin
  if v_user is not null and public."wave1_current_caller_authority_internal"()
    and not public."is_account_access_restricted"(v_user::text)
  then
    select room.* into v_room from public."watch_party_rooms" room
    where room."party_id"=p_party_id;
    select offer.* into v_offer from public."paid_watch_party_offers" offer
    where offer."party_id"=p_party_id
      and offer."status" in ('sandbox','active','paused','sold_out','blocked')
    order by offer."updated_at" desc limit 1;
    if v_room."party_id" is not null
      and coalesce(v_room."is_active",false)
      and v_room."room_type"='title'
      and v_offer."id" is not null
      and v_offer."status"<>'blocked'
      and not public."is_account_access_restricted"(v_offer."creator_id"::text)
      and not public."watch_party_room_actor_blocked_by_host"(p_party_id,v_user::text)
    then
      select ticket.* into v_ticket
      from public."paid_watch_party_tickets" ticket
      where ticket."offer_id"=v_offer."id"
        and ticket."party_id"=p_party_id
        and ticket."buyer_id"=v_user
        and ticket."status"='active'
        and ticket."refunded_at" is null
        and ticket."revoked_at" is null
        and (ticket."expires_at" is null
          or ticket."expires_at">timezone('utc'::text,now()))
      order by ticket."created_at" desc limit 1;
      if v_ticket."id" is not null then
        begin
          v_identity:=public."creator_money_historical_purchase_identity_internal"(
            v_user,'watch_party_live_ticket',v_offer."id"
          );
        exception when others then v_identity:=null;
        end;
        if v_identity is not null
          and (v_identity->>'accessGrantId')::uuid
            is not distinct from v_ticket."access_grant_id"
        then
          return jsonb_build_object(
            'allowed',true,'reason','ticket_confirmed','requiresPurchase',false,
            'ticketId',v_ticket."id",'offer',public."paid_watch_party_offer_safe_row"(v_offer)
          );
        end if;
      end if;
    end if;
  end if;
  return public."resolve_paid_watch_party_ticket_access_pre_historical_closeout"(
    p_party_id
  );
end;
$$;
revoke all on function public."resolve_paid_watch_party_ticket_access"(text)
  from public,anon;
grant execute on function public."resolve_paid_watch_party_ticket_access"(text)
  to authenticated,service_role;

alter function public."resolve_paid_creator_event_pass_access"(uuid)
  rename to "resolve_paid_creator_event_pass_access_pre_historical_closeout";
revoke all on function public."resolve_paid_creator_event_pass_access_pre_historical_closeout"(uuid)
  from public,anon,authenticated,service_role;
create or replace function public."resolve_paid_creator_event_pass_access"(
  p_creator_event_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_event public."creator_events"%rowtype;
  v_offer public."paid_creator_events"%rowtype;
  v_pass public."paid_creator_event_passes"%rowtype;
  v_identity jsonb;
begin
  if v_user is not null and public."wave1_current_caller_authority_internal"()
    and not public."is_account_access_restricted"(v_user::text)
  then
    select event.* into v_event from public."creator_events" event
    where event."id"=p_creator_event_id;
    select offer.* into v_offer from public."paid_creator_events" offer
    where offer."creator_event_id"=p_creator_event_id
      and offer."status" in ('sandbox','active','sold_out','paused','blocked')
    order by offer."updated_at" desc limit 1;
    if v_event."id" is not null
      and v_event."status" not in ('ended','expired','canceled','removed','unsafe','blocked')
      and v_offer."id" is not null
      and v_offer."status"<>'blocked'
      and not public."is_account_access_restricted"(v_offer."creator_id"::text)
      and not exists (
        select 1 from public."channel_audience_blocks" block_row
        where (block_row."channel_user_id"=v_offer."creator_id"::text
            and block_row."blocked_user_id"=v_user::text)
           or (block_row."channel_user_id"=v_user::text
            and block_row."blocked_user_id"=v_offer."creator_id"::text)
      )
    then
      select pass_row.* into v_pass
      from public."paid_creator_event_passes" pass_row
      where pass_row."event_id"=v_offer."id"
        and pass_row."buyer_id"=v_user
        and pass_row."status"='active'
        and pass_row."refunded_at" is null
        and pass_row."revoked_at" is null
        and (pass_row."expires_at" is null
          or pass_row."expires_at">timezone('utc'::text,now()))
      order by pass_row."created_at" desc limit 1;
      if v_pass."id" is not null then
        begin
          v_identity:=public."creator_money_historical_purchase_identity_internal"(
            v_user,'event_pass',v_offer."creator_event_id"
          );
        exception when others then v_identity:=null;
        end;
        if v_identity is not null
          and (v_identity->>'accessGrantId')::uuid
            is not distinct from v_pass."access_grant_id"
        then
          return jsonb_build_object(
            'allowed',true,'reason','event_pass_confirmed','requiresPurchase',false,
            'passId',v_pass."id",'offer',public."paid_creator_event_safe_row"(v_offer)
          );
        end if;
      end if;
    end if;
  end if;
  return public."resolve_paid_creator_event_pass_access_pre_historical_closeout"(
    p_creator_event_id
  );
end;
$$;
revoke all on function public."resolve_paid_creator_event_pass_access"(uuid)
  from public,anon;
grant execute on function public."resolve_paid_creator_event_pass_access"(uuid)
  to authenticated,service_role;

alter function public."resolve_creator_vip_pass_access"(uuid)
  rename to "resolve_creator_vip_pass_access_pre_historical_closeout";
revoke all on function public."resolve_creator_vip_pass_access_pre_historical_closeout"(uuid)
  from public,anon,authenticated,service_role;
create or replace function public."resolve_creator_vip_pass_access"(p_creator_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_offer public."creator_vip_pass_offers"%rowtype;
  v_pass public."creator_vip_passes"%rowtype;
  v_identity jsonb;
begin
  if v_user is not null and public."wave1_current_caller_authority_internal"()
    and not public."is_account_access_restricted"(v_user::text)
    and not public."is_account_access_restricted"(p_creator_id::text)
  then
    select offer.* into v_offer from public."creator_vip_pass_offers" offer
    where offer."creator_id"=p_creator_id
      and offer."status" in ('sandbox','active','paused','blocked')
    order by offer."updated_at" desc limit 1;
    if v_offer."id" is not null
      and v_offer."status"<>'blocked'
      and not exists (
        select 1 from public."channel_audience_blocks" block_row
        where (block_row."channel_user_id"=p_creator_id::text
            and block_row."blocked_user_id"=v_user::text)
           or (block_row."channel_user_id"=v_user::text
            and block_row."blocked_user_id"=p_creator_id::text)
      )
    then
      select pass_row.* into v_pass
      from public."creator_vip_passes" pass_row
      where pass_row."offer_id"=v_offer."id"
        and pass_row."fan_id"=v_user
        and pass_row."status"='active'
        and pass_row."refunded_at" is null
        and pass_row."revoked_at" is null
        and (pass_row."expires_at" is null
          or pass_row."expires_at">timezone('utc'::text,now()))
      order by pass_row."created_at" desc limit 1;
      if v_pass."id" is not null then
        begin
          v_identity:=public."creator_money_historical_purchase_identity_internal"(
            v_user,'vip_pass',v_offer."id"
          );
        exception when others then v_identity:=null;
        end;
        if v_identity is not null
          and (v_identity->>'accessGrantId')::uuid
            is not distinct from v_pass."access_grant_id"
        then
          return jsonb_build_object(
            'allowed',true,'reason','vip_active','requiresPurchase',false,
            'vipPassId',v_pass."id",'offer',public."creator_vip_pass_offer_safe_row"(v_offer)
          );
        end if;
      end if;
    end if;
  end if;
  return public."resolve_creator_vip_pass_access_pre_historical_closeout"(
    p_creator_id
  );
end;
$$;
revoke all on function public."resolve_creator_vip_pass_access"(uuid)
  from public,anon;
grant execute on function public."resolve_creator_vip_pass_access"(uuid)
  to authenticated,service_role;

alter function public."resolve_creator_channel_subscription_access"(uuid)
  rename to "resolve_creator_channel_subscription_access_pre_historical_closeout";
revoke all on function public."resolve_creator_channel_subscription_access_pre_historical_closeout"(uuid)
  from public,anon,authenticated,service_role;
create or replace function public."resolve_creator_channel_subscription_access"(
  p_creator_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_offer public."creator_channel_subscription_offers"%rowtype;
  v_subscription public."creator_channel_subscriptions"%rowtype;
  v_identity jsonb;
begin
  if v_user is not null and public."wave1_current_caller_authority_internal"()
    and not public."is_account_access_restricted"(v_user::text)
    and not public."is_account_access_restricted"(p_creator_id::text)
  then
    select offer.* into v_offer
    from public."creator_channel_subscription_offers" offer
    where offer."creator_id"=p_creator_id
      and offer."status" in ('sandbox','active','paused','blocked')
    order by offer."updated_at" desc limit 1;
    if v_offer."id" is not null
      and v_offer."status"<>'blocked'
      and not exists (
        select 1 from public."channel_audience_blocks" block_row
        where (block_row."channel_user_id"=p_creator_id::text
            and block_row."blocked_user_id"=v_user::text)
           or (block_row."channel_user_id"=v_user::text
            and block_row."blocked_user_id"=p_creator_id::text)
      )
    then
      select subscription.* into v_subscription
      from public."creator_channel_subscriptions" subscription
      where subscription."offer_id"=v_offer."id"
        and subscription."subscriber_id"=v_user
        and subscription."status" in ('active','trialing','grace_period','cancel_pending')
        and subscription."current_period_end" is not null
        and subscription."current_period_end">timezone('utc'::text,now())
        and subscription."revoked_at" is null
        and subscription."expired_at" is null
      order by subscription."updated_at" desc limit 1;
      if v_subscription."id" is not null then
        begin
          v_identity:=public."creator_money_historical_purchase_identity_internal"(
            v_user,'channel_subscription',v_offer."id"
          );
        exception when others then v_identity:=null;
        end;
        if v_identity is not null
          and (v_identity->>'accessGrantId')::uuid
            is not distinct from v_subscription."access_grant_id"
        then
          return jsonb_build_object(
            'allowed',true,
            'reason',case when v_subscription."status"='cancel_pending'
              then 'subscription_cancel_pending' else 'subscription_active' end,
            'requiresPurchase',false,'subscriptionId',v_subscription."id",
            'subscriptionStatus',v_subscription."status",
            'currentPeriodEnd',v_subscription."current_period_end",
            'offer',public."channel_subscription_offer_safe_row"(v_offer)
          );
        end if;
      end if;
    end if;
  end if;
  return public."resolve_creator_channel_subscription_access_pre_historical_closeout"(
    p_creator_id
  );
end;
$$;
revoke all on function public."resolve_creator_channel_subscription_access"(uuid)
  from public,anon;
grant execute on function public."resolve_creator_channel_subscription_access"(uuid)
  to authenticated,service_role;

-- This is purchase-offer authority, not playback authority. It reads only the
-- exact public classification and price first. The source-bearing helper runs
-- only after the video is proven public, clean, scanned, non-VIP, exact-owner,
-- and exact-platform-price; it returns a boolean and never returns a path.
create or replace function public."creator_video_paid_precharge_authority_internal"(
  p_video_id uuid,
  p_expected_provider text,
  p_expected_product_key text,
  p_expected_provider_product_id text,
  p_expected_amount integer,
  p_expected_currency text,
  p_expected_environment text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_session jsonb:=public."wave1_session_authority_readback"();
  v_account_legal jsonb;
  v_video_id uuid;
  v_owner_id uuid;
  v_visibility text;
  v_moderation_status text;
  v_scan_status text;
  v_quarantined_at timestamptz;
  v_vip_required boolean:=false;
  v_price public."creator_content_prices"%rowtype;
  v_identity jsonb;
  v_platform_exact boolean:=false;
begin
  if v_user is null
    or v_session->>'state'<>'ACTIVE'
    or coalesce((v_session->>'restoreOnly')::boolean,false)
    or (v_session->>'userId')::uuid is distinct from v_user
    or nullif(v_session->>'sessionGeneration','') is null
    or nullif(auth.jwt()->>'session_id','') is null
    or nullif(v_session->>'sessionGeneration','') is distinct from
      nullif(auth.jwt()->>'session_id','')
    or public."is_account_access_restricted"(v_user::text)
  then
    raise exception 'buyer_session_authority_required';
  end if;
  v_account_legal:=public."wave1_legal_requirements_readback"('account');
  if coalesce((v_account_legal->>'allAccepted')::boolean,false) is not true then
    raise exception 'buyer_account_legal_not_current';
  end if;
  if p_video_id is null
    or p_expected_provider not in ('revenuecat_app_store','revenuecat_google_play')
    or nullif(pg_catalog.btrim(coalesce(p_expected_product_key,'')),'') is null
    or nullif(pg_catalog.btrim(coalesce(p_expected_provider_product_id,'')),'') is null
    or coalesce(p_expected_amount,0)<=0
    or lower(pg_catalog.btrim(coalesce(p_expected_currency,'')))<>'usd'
    or p_expected_environment not in ('sandbox','production')
  then
    raise exception 'paid_video_source_offer_not_available';
  end if;

  -- Serialize every store rail for one buyer/video before taking the shared
  -- video-commerce lock.  The transaction-level lock is intentionally also
  -- acquired by the iOS specialized guard: re-entry in that transaction is
  -- harmless, while Android and iOS can no longer each mint a pending intent
  -- after observing an empty cross-store lane.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'creator-money-source-intent:'||v_user::text||':paid_content:'||
      p_video_id::text,0
  ));
  if exists (
    select 1
    from public."money_purchase_intents" pending
    where pending."user_id"=v_user
      and pending."source_type"='paid_content'
      and pending."source_id"=p_video_id
      and pending."status"='pending'
      and pending."expires_at">timezone('utc'::text,now())
  ) then
    raise exception 'source_purchase_intent_already_pending';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('creator-video-commerce:'||p_video_id::text,0)
  );

  select video."id",video."owner_id",video."visibility",video."moderation_status",
    video."scan_status",video."quarantined_at",coalesce(video."vip_access_required",false)
  into v_video_id,v_owner_id,v_visibility,v_moderation_status,
    v_scan_status,v_quarantined_at,v_vip_required
  from public."videos" video
  where video."id"=p_video_id
  for key share;
  if v_video_id is null then
    raise exception 'paid_video_source_offer_not_available';
  end if;

  -- A historical exact purchase is returned as no-charge identity even when
  -- the creator has paused/repriced the offer or the media is temporarily
  -- unavailable. Playback still rechecks current content safety separately.
  begin
    v_identity:=public."creator_video_existing_purchase_identity_internal"(
      v_user,p_video_id
    );
  exception when others then
    v_identity:=null;
  end;
  if v_identity is not null then
    return jsonb_build_object(
      'alreadyPurchased',true,'creatorId',v_owner_id
    )||v_identity;
  end if;

  if v_visibility<>'public'
    or coalesce(v_moderation_status,'clean') not in ('clean','reported')
    or v_quarantined_at is not null
    or not public."media_scan_public_safe"(v_scan_status)
    or v_vip_required
    or public."is_account_access_restricted"(v_owner_id::text)
    or not public."wave1_creator_money_subject_authorized_internal"(v_owner_id)
    or v_owner_id=v_user
    or exists (
      select 1 from public."channel_audience_blocks" block_row
      where (block_row."channel_user_id"=v_owner_id::text
          and block_row."blocked_user_id"=v_user::text)
         or (block_row."channel_user_id"=v_user::text
          and block_row."blocked_user_id"=v_owner_id::text)
    )
  then
    raise exception 'paid_video_source_offer_not_available';
  end if;

  select price.* into v_price
  from public."creator_content_prices" price
  where price."content_type"='creator_video'
    and price."content_id"=p_video_id
    and price."creator_id"=v_owner_id
  order by price."updated_at" desc,price."id" desc
  limit 1
  for key share;
  if v_price."id" is null
    or not coalesce(v_price."is_paid",false)
    or v_price."status" is distinct from (
      case when p_expected_environment='production'
        then 'active' else 'sandbox' end
    )
    or v_price."price_cents" is distinct from p_expected_amount
    or lower(v_price."currency") is distinct from lower(p_expected_currency)
  then
    raise exception 'paid_video_source_offer_not_available';
  end if;

  if p_expected_provider='revenuecat_google_play' then
    v_platform_exact:=v_price."provider"='revenuecat_google_play'
      and v_price."provider_product_key"=p_expected_product_key
      and v_price."provider_product_id"=p_expected_provider_product_id;
  else
    select count(*)=1 into v_platform_exact
    from public."monetization_product_store_mappings" mapping
    join public."monetization_products" product on product."id"=mapping."product_id"
    where mapping."concept"='paid_video'
      and mapping."platform"='ios'
      and mapping."store"='app_store'
      and mapping."provider"='revenuecat_app_store'
      and mapping."provider_product_id"=p_expected_provider_product_id
      and product."product_key"=p_expected_product_key
      and product."product_type"='paid_content_access'
      and mapping."reference_price_minor"=p_expected_amount
      and lower(mapping."reference_currency")=lower(p_expected_currency)
      and mapping."environment"=p_expected_environment
      and mapping."status"=case
        when p_expected_environment='production' then 'active' else 'sandbox' end
      and mapping."store_product_type"='consumable'
      and not mapping."grants_livekit_authority"
      and not mapping."creates_payable_balance";
  end if;
  if not v_platform_exact
    or not public."creator_video_playable_source_after_authority_internal"(p_video_id)
  then
    raise exception 'paid_video_source_offer_not_available';
  end if;

  return jsonb_build_object(
    'alreadyPurchased',false,
    'creatorId',v_owner_id,'priceCents',v_price."price_cents",
    'currency',lower(v_price."currency")
  );
end;
$$;
revoke all on function public."creator_video_paid_precharge_authority_internal"(
  uuid,text,text,text,integer,text,text
) from public,anon,authenticated,service_role;

-- Replace the Paid Video branch instead of delegating to the historical branch:
-- that branch predates the JSON authority contract and can evaluate a JSON
-- access result as a boolean. Event/VIP/Channel behavior remains delegated.
alter function public."create_ios_creator_money_purchase_intent"(text,uuid,integer,jsonb)
  rename to "create_ios_creator_money_purchase_intent_pre_protected_video_closeout";
alter function public."create_ios_creator_money_purchase_intent_pre_protected_video_closeout"(
  text,uuid,integer,jsonb
) set search_path = '';
revoke all on function public."create_ios_creator_money_purchase_intent_pre_protected_video_closeout"(
  text,uuid,integer,jsonb
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
  v_account_legal jsonb;
  v_concept text:=lower(pg_catalog.btrim(coalesce(p_concept,'')));
  v_now timestamptz:=timezone('utc'::text,now());
  v_environment text;
  v_required_status text;
  v_creator uuid;
  v_price integer;
  v_currency text;
  v_mapping_count integer:=0;
  v_mapping public."monetization_product_store_mappings"%rowtype;
  v_product public."monetization_products"%rowtype;
  v_precharge jsonb;
  v_existing public."money_purchase_intents"%rowtype;
  v_pending public."money_purchase_intents"%rowtype;
  v_intent public."money_purchase_intents"%rowtype;
  v_safe_metadata jsonb;
  v_app_store_state text;
  v_webhook_state text;
  v_paid_content_state text;
  v_creator_money_state text;
  v_live_state text;
  v_payout_state text;
begin
  if v_concept<>'paid_video' then
    return public."create_ios_creator_money_purchase_intent_pre_protected_video_closeout"(
      p_concept,p_source_id,p_amount_minor,p_metadata
    );
  end if;
  if v_user is null
    or v_session->>'state'<>'ACTIVE'
    or coalesce((v_session->>'restoreOnly')::boolean,false)
    or (v_session->>'userId')::uuid is distinct from v_user
    or nullif(v_session->>'sessionGeneration','') is null
    or nullif(auth.jwt()->>'session_id','') is null
    or nullif(v_session->>'sessionGeneration','') is distinct from
      nullif(auth.jwt()->>'session_id','')
    or public."is_account_access_restricted"(v_user::text)
  then
    raise exception 'buyer_session_authority_required';
  end if;
  if p_source_id is null or coalesce(p_amount_minor,0)<=0 then
    raise exception 'paid_video_source_offer_not_available';
  end if;
  v_account_legal:=public."wave1_legal_requirements_readback"('account');
  if coalesce((v_account_legal->>'allAccepted')::boolean,false) is not true then
    raise exception 'buyer_account_legal_not_current';
  end if;
  v_safe_metadata:=public."creator_money_client_metadata_internal"(p_metadata);

  -- Any exact active historical purchase is terminal no-charge authority. It
  -- is resolved before mutable price/status/catalog checks so pause, reprice,
  -- platform retirement, or seller payout-readiness changes cannot cause a
  -- duplicate consumable purchase.
  begin
    v_precharge:=public."creator_video_existing_purchase_identity_internal"(
      v_user,p_source_id
    );
  exception when others then
    v_precharge:=null;
  end;
  if v_precharge is not null then
    select intent.* into v_existing
    from public."money_purchase_intents" intent
    where intent."id"=(v_precharge->>'id')::uuid;
    if v_existing."id" is null or v_existing."status"<>'consumed' then
      raise exception 'existing_paid_video_identity_invalid';
    end if;
    return public."money_purchase_intent_safe_row"(v_existing)
      ||jsonb_build_object(
        'alreadyPurchased',true,'concept','paid_video',
        'providerProductId',v_existing."provider_product_id",
        'environment',v_existing."environment"
      );
  end if;

  select "state" into v_app_store_state
  from public."platform_money_kill_switches" where "key"='revenuecat_app_store_enabled';
  select "state" into v_webhook_state
  from public."platform_money_kill_switches" where "key"='provider_webhooks_enabled';
  select "state" into v_paid_content_state
  from public."platform_money_kill_switches" where "key"='paid_content_enabled';
  select "state" into v_creator_money_state
  from public."platform_money_kill_switches" where "key"='creator_monetization_enabled';
  select "state" into v_live_state
  from public."platform_money_kill_switches" where "key"='live_money_enabled';
  select "state" into v_payout_state
  from public."platform_money_kill_switches" where "key"='payouts_enabled';
  if v_app_store_state='sandbox_only'
    and v_webhook_state='sandbox_only'
    and v_paid_content_state='sandbox_only'
    and v_creator_money_state in ('sandbox_only','on')
    and coalesce(v_live_state,'off')='off'
    and coalesce(v_payout_state,'off')='off'
  then
    v_environment:='sandbox';
    v_required_status:='sandbox';
    if not (
      public."has_platform_role"(array['owner'::text,'operator'::text])
      or public."has_active_beta_access"()
      or public."resolve_sandbox_monetization_tester"(
        v_user::text,nullif(lower(pg_catalog.btrim(coalesce(auth.jwt()->>'email',''))),'')
      )
    ) then
      raise exception 'sandbox_monetization_tester_required';
    end if;
  elsif v_app_store_state='on'
    and v_webhook_state='on'
    and v_paid_content_state='on'
    and v_creator_money_state='on'
    and v_live_state='on'
  then
    v_environment:='production';
    v_required_status:='active';
    v_account_legal:=public."wave1_legal_requirements_readback"('creator_money');
    if coalesce((v_account_legal->>'allAccepted')::boolean,false) is not true
      or v_account_legal->>'market'<>'UNITED_STATES'
    then
      raise exception 'buyer_creator_money_legal_not_current';
    end if;
  else
    raise exception 'ios_creator_money_disabled';
  end if;

  select price."creator_id",price."price_cents",lower(price."currency")
  into v_creator,v_price,v_currency
  from public."creator_content_prices" price
  where price."content_type"='creator_video'
    and price."content_id"=p_source_id
    and price."is_paid"
    and price."status"=v_required_status
  order by price."updated_at" desc,price."id" desc
  limit 1;
  if v_creator is null or v_price is null
    or v_price is distinct from p_amount_minor
    or v_currency<>'usd'
  then
    raise exception 'paid_video_source_offer_not_available';
  end if;

  select count(*) into v_mapping_count
  from public."monetization_product_store_mappings" mapping
  join public."monetization_products" product on product."id"=mapping."product_id"
  where mapping."concept"='paid_video'
    and mapping."platform"='ios'
    and mapping."store"='app_store'
    and mapping."provider"='revenuecat_app_store'
    and mapping."reference_price_minor"=v_price
    and lower(mapping."reference_currency")=v_currency
    and mapping."environment"=v_environment
    and mapping."status"=v_required_status
    and mapping."store_product_type"='consumable'
    and mapping."unlocks_digital_access"
    and not mapping."grants_livekit_authority"
    and not mapping."creates_payable_balance"
    and product."product_type"='paid_content_access';
  if v_mapping_count<>1 then raise exception 'ios_store_tier_mapping_missing'; end if;
  select mapping.* into v_mapping
  from public."monetization_product_store_mappings" mapping
  join public."monetization_products" product on product."id"=mapping."product_id"
  where mapping."concept"='paid_video'
    and mapping."platform"='ios'
    and mapping."store"='app_store'
    and mapping."provider"='revenuecat_app_store'
    and mapping."reference_price_minor"=v_price
    and lower(mapping."reference_currency")=v_currency
    and mapping."environment"=v_environment
    and mapping."status"=v_required_status
    and mapping."store_product_type"='consumable'
    and mapping."unlocks_digital_access"
    and not mapping."grants_livekit_authority"
    and not mapping."creates_payable_balance"
    and product."product_type"='paid_content_access';
  select product.* into v_product
  from public."monetization_products" product
  where product."id"=v_mapping."product_id";
  if v_product."id" is null then raise exception 'ios_conceptual_product_missing'; end if;
  if v_environment='production' and (
    coalesce((v_mapping."metadata"->>'provider_proof')::boolean,false) is not true
    or coalesce((v_mapping."metadata"->>'owner_release_approved')::boolean,false) is not true
    or coalesce((v_mapping."metadata"->>'physical_device_proof')::boolean,false) is not true
  ) then
    raise exception 'ios_production_mapping_proof_incomplete';
  end if;

  v_precharge:=public."creator_video_paid_precharge_authority_internal"(
    p_source_id,'revenuecat_app_store',v_product."product_key",
    v_mapping."provider_product_id",v_price,v_currency,v_environment
  );
  if coalesce((v_precharge->>'alreadyPurchased')::boolean,false) then
    select intent.* into v_existing
    from public."money_purchase_intents" intent
    where intent."id"=(v_precharge->>'id')::uuid;
    if v_existing."id" is null or v_existing."status"<>'consumed' then
      raise exception 'existing_paid_video_identity_invalid';
    end if;
    return public."money_purchase_intent_safe_row"(v_existing)
      ||jsonb_build_object(
        'alreadyPurchased',true,'concept','paid_video',
        'providerProductId',v_existing."provider_product_id",
        'environment',v_existing."environment"
      );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'ios-pending-intent:'||v_user::text||':revenuecat_app_store:paid_video:'||v_price::text,0
  ));
  select pending.* into v_pending
  from public."money_purchase_intents" pending
  where pending."user_id"=v_user
    and pending."product_id"=v_product."id"
    and pending."provider"='revenuecat_app_store'
    and pending."provider_product_id"=v_mapping."provider_product_id"
    and pending."environment"=v_environment
    and pending."status"='pending'
    and pending."expires_at">v_now
    and pending."source_type"='paid_content'
    and pending."source_id"=p_source_id
    and pending."creator_id"=v_creator
    and pending."amount_minor"=v_price
    and lower(pending."currency")=v_currency
  order by pending."created_at",pending."id"
  limit 1
  for update;
  if v_pending."id" is not null then
    return public."money_purchase_intent_safe_row"(v_pending)
      ||jsonb_build_object(
        'alreadyPurchased',false,'concept','paid_video',
        'providerProductId',v_pending."provider_product_id",
        'environment',v_pending."environment"
      );
  end if;
  if exists (
    select 1 from public."money_purchase_intents" pending
    where pending."user_id"=v_user
      and pending."provider"='revenuecat_app_store'
      and pending."provider_product_id"=v_mapping."provider_product_id"
      and pending."environment"=v_environment
      and pending."status"='pending'
      and pending."expires_at">v_now
  ) then
    raise exception 'pooled_provider_product_intent_already_pending';
  end if;
  if (
    select count(*) from public."money_purchase_intents" recent
    where recent."user_id"=v_user
      and recent."provider"='revenuecat_app_store'
      and recent."status"='pending'
      and recent."expires_at">v_now
      and recent."created_at">v_now-interval '1 minute'
  )>=6 then
    raise exception 'ios_purchase_intent_rate_limited';
  end if;
  if not public."wave1_creator_money_subject_authorized_internal"(v_creator) then
    raise exception 'creator_money_source_authority_required' using errcode='42501';
  end if;

  insert into public."money_purchase_intents" (
    "user_id","product_id","product_key","product_type","provider",
    "provider_product_id","source_type","source_id","creator_id","environment",
    "status","amount_minor","currency","idempotency_key","expires_at",
    "session_generation","metadata"
  ) values (
    v_user,v_product."id",v_product."product_key",v_product."product_type",
    'revenuecat_app_store',v_mapping."provider_product_id",'paid_content',
    p_source_id,v_creator,v_environment,'pending',v_price,v_currency,
    'ios_creator_money:'||v_user::text||':'||gen_random_uuid()::text,
    v_now+interval '15 minutes',v_session->>'sessionGeneration',
    jsonb_build_object(
      'store_mapping_id',v_mapping."id",'concept','paid_video',
      'sandbox_only',v_environment='sandbox',
      'production_intent',v_environment='production','not_payable',true,
      'viewer_access_only',true,'grants_livekit_authority',false,
      'grants_host_authority',false,'premium_unlock',false,'payout_ready',false,
      'creator_eligibility_required',true,'canonical_content_type','creator_video',
      'protected_video_precharge_checked',true
    )||v_safe_metadata
  ) returning * into v_intent;
  return public."money_purchase_intent_safe_row"(v_intent)
    ||jsonb_build_object(
      'alreadyPurchased',false,'concept','paid_video',
      'providerProductId',v_mapping."provider_product_id",
      'environment',v_environment,'storeMappingId',v_mapping."id"
    );
end;
$$;
revoke all on function public."create_ios_creator_money_purchase_intent"(
  text,uuid,integer,jsonb
) from public,anon;
grant execute on function public."create_ios_creator_money_purchase_intent"(
  text,uuid,integer,jsonb
) to authenticated,service_role;

alter function public."create_money_purchase_intent"(text,text,uuid,jsonb)
  rename to "create_money_purchase_intent_pre_protected_video_closeout";
alter function public."create_money_purchase_intent_pre_protected_video_closeout"(
  text,text,uuid,jsonb
) set search_path = '';
revoke all on function public."create_money_purchase_intent_pre_protected_video_closeout"(
  text,text,uuid,jsonb
) from public,anon,authenticated,service_role;

create or replace function public."create_money_purchase_intent"(
  p_product_key text,
  p_source_type text,
  p_source_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_headers jsonb:=case
    when nullif(current_setting('request.headers',true),'') is null then '{}'::jsonb
    else current_setting('request.headers',true)::jsonb end;
  v_client_platform text:=lower(pg_catalog.btrim(coalesce(
    v_headers->>'x-chillywood-platform',''
  )));
  v_product public."monetization_products"%rowtype;
  v_catalog_digits text;
  v_catalog_amount integer;
  v_precharge jsonb;
  v_existing public."money_purchase_intents"%rowtype;
  v_user uuid:=auth.uid();
  v_session jsonb:=public."wave1_session_authority_readback"();
begin
  if p_product_key<>'paid_content_access_sandbox_099'
    or p_source_type<>'paid_content'
  then
    return public."create_money_purchase_intent_pre_protected_video_closeout"(
      p_product_key,p_source_type,p_source_id,p_metadata
    );
  end if;
  -- The generic router's iOS branch is guarded by the replacement above. Do
  -- not force an App Store tier through the Google product stored on the shared
  -- creator-authored offer.
  if v_client_platform='ios' then
    return public."create_money_purchase_intent_pre_protected_video_closeout"(
      p_product_key,p_source_type,p_source_id,p_metadata
    );
  end if;

  if v_user is null
    or v_session->>'state'<>'ACTIVE'
    or coalesce((v_session->>'restoreOnly')::boolean,false)
    or (v_session->>'userId')::uuid is distinct from v_user
    or nullif(v_session->>'sessionGeneration','') is distinct from
      nullif(auth.jwt()->>'session_id','')
    or public."is_account_access_restricted"(v_user::text)
  then
    raise exception 'buyer_session_authority_required';
  end if;
  begin
    v_precharge:=public."creator_video_existing_purchase_identity_internal"(
      v_user,p_source_id
    );
  exception when others then
    v_precharge:=null;
  end;
  if v_precharge is not null then
    select intent.* into v_existing
    from public."money_purchase_intents" intent
    where intent."id"=(v_precharge->>'id')::uuid;
    if v_existing."id" is null or v_existing."status"<>'consumed' then
      raise exception 'existing_paid_video_identity_invalid';
    end if;
    return public."money_purchase_intent_safe_row"(v_existing)
      ||jsonb_build_object(
        'alreadyPurchased',true,'concept','paid_video',
        'providerProductId',v_existing."provider_product_id",
        'environment',v_existing."environment"
      );
  end if;

  select product.* into v_product
  from public."monetization_products" product
  where product."product_key"=p_product_key
  limit 1;
  if v_product."id" is null
    or v_product."product_type"<>'paid_content_access'
    or v_product."status"<>'sandbox'
    or v_product."environment"<>'sandbox'
    or not coalesce(v_product."is_android_digital",false)
    or v_product."provider"<>'revenuecat_google_play'
    or nullif(pg_catalog.btrim(coalesce(v_product."provider_product_id",'')),'') is null
    or coalesce((v_product."metadata"->>'sandbox_purchase_intents_enabled')::boolean,false) is not true
  then
    raise exception 'android_digital_product_not_authorized';
  end if;
  v_catalog_digits:=coalesce(
    nullif(v_product."metadata"->>'price_tier',''),
    substring(v_product."product_key" from '([0-9]+)$')
  );
  if coalesce(v_catalog_digits,'')!~'^[0-9]+$' then
    raise exception 'provider_catalog_price_missing';
  end if;
  v_catalog_amount:=v_catalog_digits::integer;
  if v_catalog_amount<=0 then raise exception 'provider_catalog_price_invalid'; end if;

  v_precharge:=public."creator_video_paid_precharge_authority_internal"(
    p_source_id,v_product."provider",v_product."product_key",
    v_product."provider_product_id",v_catalog_amount,'usd','sandbox'
  );
  if coalesce((v_precharge->>'alreadyPurchased')::boolean,false) then
    select intent.* into v_existing
    from public."money_purchase_intents" intent
    where intent."id"=(v_precharge->>'id')::uuid;
    if v_existing."id" is null or v_existing."status"<>'consumed' then
      raise exception 'existing_paid_video_identity_invalid';
    end if;
    return public."money_purchase_intent_safe_row"(v_existing)
      ||jsonb_build_object(
        'alreadyPurchased',true,'concept','paid_video',
        'providerProductId',v_existing."provider_product_id",
        'environment',v_existing."environment"
      );
  end if;
  return public."create_money_purchase_intent_pre_protected_video_closeout"(
    p_product_key,p_source_type,p_source_id,p_metadata
  );
end;
$$;
revoke all on function public."create_money_purchase_intent"(text,text,uuid,jsonb)
  from public,anon;
grant execute on function public."create_money_purchase_intent"(text,text,uuid,jsonb)
  to authenticated,service_role;

-- Do not persist an offer price that no installed Google product can charge.
-- The current cross-platform sandbox catalog has one shared Paid Video tier;
-- additional prices require a real Google product plus matching App Store tier.
alter function public."set_creator_content_price"(text,uuid,boolean,integer,text)
  rename to "set_creator_content_price_pre_finite_paid_video_tier";
alter function public."set_creator_content_price_pre_finite_paid_video_tier"(
  text,uuid,boolean,integer,text
) set search_path = '';
revoke all on function public."set_creator_content_price_pre_finite_paid_video_tier"(
  text,uuid,boolean,integer,text
) from public,anon,authenticated,service_role;

create or replace function public."set_creator_content_price"(
  p_content_type text,
  p_content_id uuid,
  p_is_paid boolean,
  p_price_cents integer,
  p_currency text default 'usd'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public."monetization_products"%rowtype;
  v_catalog_digits text;
  v_catalog_amount integer;
begin
  if p_content_type='creator_video' and coalesce(p_is_paid,false) then
    select product.* into v_product
    from public."monetization_products" product
    where product."product_key"='paid_content_access_sandbox_099'
      and product."product_type"='paid_content_access'
      and product."provider"='revenuecat_google_play'
      and product."environment"='sandbox'
      and product."status"='sandbox'
      and product."is_android_digital"
      and nullif(pg_catalog.btrim(coalesce(product."provider_product_id",'')),'') is not null
      and coalesce((product."metadata"->>'sandbox_purchase_intents_enabled')::boolean,false)
    limit 1;
    if v_product."id" is null then raise exception 'paid_video_store_tier_not_available'; end if;
    v_catalog_digits:=coalesce(
      nullif(v_product."metadata"->>'price_tier',''),
      substring(v_product."product_key" from '([0-9]+)$')
    );
    if coalesce(v_catalog_digits,'')!~'^[0-9]+$' then
      raise exception 'paid_video_store_tier_not_available';
    end if;
    v_catalog_amount:=v_catalog_digits::integer;
    if p_price_cents is distinct from v_catalog_amount
      or lower(pg_catalog.btrim(coalesce(p_currency,'')))<>'usd'
    then
      raise exception 'paid_video_store_tier_not_available';
    end if;
  end if;
  return public."set_creator_content_price_pre_finite_paid_video_tier"(
    p_content_type,p_content_id,p_is_paid,p_price_cents,p_currency
  );
end;
$$;
revoke all on function public."set_creator_content_price"(
  text,uuid,boolean,integer,text
) from public,anon;
grant execute on function public."set_creator_content_price"(
  text,uuid,boolean,integer,text
) to authenticated,service_role;

create or replace function public."resolve_creator_content_access"(
  p_content_type text,
  p_content_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid:=auth.uid();
  v_video_id uuid;
  v_owner_id uuid;
  v_visibility text;
  v_moderation_status text;
  v_scan_status text;
  v_quarantined_at timestamptz;
  v_vip_required boolean:=false;
  v_price public."creator_content_prices"%rowtype;
  v_is_staff boolean:=false;
  v_vip jsonb;
  v_purchase_identity jsonb;
  v_headers jsonb:=case
    when nullif(current_setting('request.headers',true),'') is null then '{}'::jsonb
    else current_setting('request.headers',true)::jsonb end;
  v_client_platform text;
  v_offer_provider text;
  v_offer_product_id text;
  v_offer_product_key text;
  v_mapping_count integer:=0;
begin
  if p_content_type<>'creator_video' then
    return jsonb_build_object('allowed',false,'reason','unsupported_content_type','requiresPurchase',false);
  end if;
  if v_viewer is not null
    and public."is_account_access_restricted"(v_viewer::text)
  then
    return jsonb_build_object('allowed',false,'reason','content_unavailable','requiresPurchase',false);
  end if;
  if v_viewer is not null and not public."wave1_current_caller_authority_internal"() then
    return jsonb_build_object('allowed',false,'reason','session_authority_not_current','requiresPurchase',false);
  end if;

  -- Classification and creator binding are the only video fields read before
  -- commerce authority. Source URL/key/path metadata is intentionally absent.
  select video."id",video."owner_id",video."visibility",video."moderation_status",
    video."scan_status",video."quarantined_at",coalesce(video."vip_access_required",false)
  into v_video_id,v_owner_id,v_visibility,v_moderation_status,
    v_scan_status,v_quarantined_at,v_vip_required
  from public."videos" video
  where video."id"=p_content_id;
  if v_video_id is null then
    return jsonb_build_object('allowed',false,'reason','content_unavailable','requiresPurchase',false);
  end if;

  v_is_staff:=v_viewer is not null
    and public."has_platform_role"(array['owner'::text,'operator'::text]);
  if v_viewer is not null and (v_viewer=v_owner_id or v_is_staff) then
    return jsonb_build_object('allowed',true,'reason','owner','requiresPurchase',false);
  end if;

  if public."is_account_access_restricted"(v_owner_id::text)
    or (v_viewer is not null and public."is_creator_video_viewer_blocked"(
      v_owner_id::text,v_viewer::text
    ))
    or v_visibility<>'public'
    or coalesce(v_moderation_status,'clean') not in ('clean','reported')
    or v_quarantined_at is not null
    or not public."media_scan_public_safe"(v_scan_status)
  then
    return jsonb_build_object('allowed',false,'reason','content_unavailable','requiresPurchase',false);
  end if;

  -- VIP is exact-creator authority and is never interchangeable with Premium,
  -- a channel subscription, or a neighboring paid-video grant.
  if v_vip_required then
    if v_viewer is null then
      return jsonb_build_object(
        'allowed',false,'reason','identity_required','requiresPurchase',true,
        'creatorId',v_owner_id
      );
    end if;
    begin
      v_vip:=public."resolve_creator_vip_pass_access"(v_owner_id);
    exception when others then
      v_vip:=null;
    end;
    if v_vip is not null
      and coalesce((v_vip->>'allowed')::boolean,false)
      and v_vip->>'reason'='vip_active'
      and nullif(v_vip->'offer'->>'creatorId','')::uuid is not distinct from v_owner_id
      and public."creator_video_playable_source_after_authority_internal"(p_content_id)
    then
      return jsonb_build_object(
        'allowed',true,'reason','vip_active','requiresPurchase',false,
        'creatorId',v_owner_id
      );
    end if;
    return jsonb_build_object(
      'allowed',false,
      'reason',case
        when v_vip is null then 'vip_authority_unresolved'
        else coalesce(nullif(v_vip->>'reason',''),'vip_authority_unresolved')
      end,
      'requiresPurchase',coalesce((v_vip->>'requiresPurchase')::boolean,false),
      'creatorId',v_owner_id
    );
  end if;

  -- Historical Paid Video ownership is immutable provider authority for this
  -- exact buyer/video/creator. Repricing, pausing future sales, or a creator's
  -- later payout-readiness change does not revoke a nonrefunded purchase.
  if v_viewer is not null then
    begin
      v_purchase_identity:=public."creator_video_existing_purchase_identity_internal"(
        v_viewer,p_content_id
      );
    exception when others then
      v_purchase_identity:=null;
    end;
  end if;
  if v_purchase_identity is not null
    and nullif(v_purchase_identity->>'id','') is not null
    and nullif(v_purchase_identity->>'accessGrantId','') is not null
    and public."creator_video_playable_source_after_authority_internal"(p_content_id)
  then
    return jsonb_build_object(
      'allowed',true,
      'reason',case
        when v_purchase_identity->>'environment'='production' then 'active_grant'
        else 'sandbox_grant'
      end,
      'requiresPurchase',false
    );
  end if;

  -- Load the latest exact price even when paused or blocked. A protected offer
  -- never becomes free merely because it is not currently purchasable.
  select price.* into v_price
  from public."creator_content_prices" price
  where price."content_type"='creator_video'
    and price."content_id"=p_content_id
    and price."creator_id"=v_owner_id
  order by price."updated_at" desc,price."id" desc
  limit 1;
  if v_price."id" is null or not coalesce(v_price."is_paid",false) then
    if public."creator_video_playable_source_after_authority_internal"(p_content_id) then
      return jsonb_build_object('allowed',true,'reason','free_content','requiresPurchase',false);
    end if;
    return jsonb_build_object('allowed',false,'reason','content_unavailable','requiresPurchase',false);
  end if;
  if v_price."status" not in ('sandbox','active') then
    return jsonb_build_object('allowed',false,'reason','content_unavailable','requiresPurchase',false);
  end if;
  if not public."wave1_creator_money_subject_authorized_internal"(v_owner_id)
    or coalesce(v_price."price_cents",0)<=0
    or lower(trim(coalesce(v_price."currency",''))) !~ '^[a-z]{3}$'
    or v_price."provider" not in ('revenuecat_app_store','revenuecat_google_play')
    or nullif(trim(coalesce(v_price."provider_product_id",'')),'') is null
    or nullif(trim(coalesce(v_price."provider_product_key",'')),'') is null
  then
    return jsonb_build_object('allowed',false,'reason','content_unavailable','requiresPurchase',false);
  end if;

  v_client_platform:=lower(pg_catalog.btrim(coalesce(
    v_headers->>'x-chillywood-platform',''
  )));
  v_offer_provider:=v_price."provider";
  v_offer_product_id:=v_price."provider_product_id";
  v_offer_product_key:=v_price."provider_product_key";
  if v_client_platform='ios' then
    select count(*) into v_mapping_count
    from public."monetization_product_store_mappings" mapping
    join public."monetization_products" product on product."id"=mapping."product_id"
    where mapping."concept"='paid_video'
      and mapping."platform"='ios'
      and mapping."store"='app_store'
      and mapping."provider"='revenuecat_app_store'
      and mapping."reference_price_minor"=v_price."price_cents"
      and lower(mapping."reference_currency")=lower(v_price."currency")
      and mapping."environment"=case
        when v_price."status"='active' then 'production' else 'sandbox' end
      and mapping."status"=v_price."status"
      and mapping."store_product_type"='consumable'
      and mapping."unlocks_digital_access"
      and not mapping."grants_livekit_authority"
      and not mapping."creates_payable_balance"
      and product."product_type"='paid_content_access';
    if v_mapping_count<>1 then
      return jsonb_build_object(
        'allowed',false,'reason','content_unavailable','requiresPurchase',false
      );
    end if;
    select mapping."provider",mapping."provider_product_id",product."product_key"
    into v_offer_provider,v_offer_product_id,v_offer_product_key
    from public."monetization_product_store_mappings" mapping
    join public."monetization_products" product on product."id"=mapping."product_id"
    where mapping."concept"='paid_video'
      and mapping."platform"='ios'
      and mapping."store"='app_store'
      and mapping."provider"='revenuecat_app_store'
      and mapping."reference_price_minor"=v_price."price_cents"
      and lower(mapping."reference_currency")=lower(v_price."currency")
      and mapping."environment"=case
        when v_price."status"='active' then 'production' else 'sandbox' end
      and mapping."status"=v_price."status"
      and mapping."store_product_type"='consumable'
      and mapping."unlocks_digital_access"
      and not mapping."grants_livekit_authority"
      and not mapping."creates_payable_balance"
      and product."product_type"='paid_content_access';
  end if;

  return jsonb_build_object(
    'allowed',false,'reason','purchase_required','requiresPurchase',true,
    'priceCents',v_price."price_cents",'currency',lower(v_price."currency"),
    'creatorId',v_owner_id,'provider',v_offer_provider,
    'providerProductId',v_offer_product_id,
    'providerProductKey',v_offer_product_key,'offerStatus',v_price."status"
  );
exception when others then
  return jsonb_build_object(
    'allowed',false,'reason','access_resolution_failed','requiresPurchase',false
  );
end;
$$;

revoke all on function public."resolve_creator_content_access"(text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public."resolve_creator_content_access"(text,uuid)
  to anon,authenticated;
comment on function public."resolve_creator_content_access"(text,uuid) is
  'Unified source-bearing creator-video authority. Exact creator VIP or exact per-video provider authority is resolved before protected row, rendition, object, or signed URL disclosure; malformed and paused state denies.';

create or replace function public."has_paid_content_access"(
  p_user_id uuid,
  p_content_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_owner_id uuid;
  v_access jsonb;
begin
  if v_user is null
    or p_user_id is distinct from v_user
    or not public."wave1_current_caller_authority_internal"()
    or public."is_account_access_restricted"(v_user::text)
  then
    return jsonb_build_object(
      'allowed',false,'status','blocked','reason','subject_authority_required'
    );
  end if;
  -- Owner binding is classification only; no source-bearing video field is read.
  select video."owner_id" into v_owner_id
  from public."videos" video
  where video."id"=p_content_id;
  if v_owner_id is null then
    return jsonb_build_object(
      'allowed',false,'status','missing','reason','content_unavailable'
    );
  end if;
  if v_owner_id=v_user
    or public."has_platform_role"(array['owner'::text,'operator'::text])
  then
    return jsonb_build_object(
      'allowed',true,'status','owner_or_admin','reason','owner_or_admin_preview'
    );
  end if;
  v_access:=public."resolve_creator_content_access"('creator_video',p_content_id);
  if coalesce((v_access->>'allowed')::boolean,false)
    and v_access->>'reason' in ('active_grant','sandbox_grant')
  then
    return jsonb_build_object(
      'allowed',true,'status',v_access->>'reason','reason',v_access->>'reason'
    );
  end if;
  return jsonb_build_object(
    'allowed',false,'status','blocked',
    'reason',coalesce(nullif(v_access->>'reason',''),'purchase_required')
  );
exception when others then
  return jsonb_build_object(
    'allowed',false,'status','blocked','reason','access_resolution_failed'
  );
end;
$$;
revoke all on function public."has_paid_content_access"(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public."has_paid_content_access"(uuid,uuid)
  to authenticated;

-- Historical entitlement identity is immutable purchase/provider authority.
-- Mutable offer price, product, sale status, and seller payout readiness govern
-- only a new sale and must not revoke an unexpired, unrefunded purchase.
create or replace function public."creator_money_historical_purchase_identity_internal"(
  p_user_id uuid,
  p_grant_type text,
  p_source_id uuid,
  p_expected_access_grant_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_count integer:=0;
  v_intent_id uuid;
  v_access_grant_id uuid;
  v_provider text;
  v_provider_product_id text;
  v_environment text;
begin
  if p_user_id is null
    or p_grant_type not in (
      'watch_party_live_ticket','event_pass','vip_pass',
      'channel_subscription','paid_content_access'
    )
    or p_source_id is null
  then
    raise exception 'historical_purchase_identity_invalid';
  end if;

  with candidates as (
    select distinct intent."id",grant_row."id" as access_grant_id,
      intent."provider",intent."provider_product_id",intent."environment"
    from public."access_grants" grant_row
    join public."provider_events" provider_event
      on provider_event."id"=grant_row."provider_event_id"
     and provider_event."provider"=grant_row."provider"
     and provider_event."provider" in ('revenuecat_app_store','revenuecat_google_play')
     and provider_event."user_id"=p_user_id
     and provider_event."product_id"=grant_row."product_id"
     and provider_event."product_key"=grant_row."metadata"->>'product_key'
     and provider_event."environment"=grant_row."environment"
     and provider_event."status"='processed'
    join public."money_purchase_intents" intent
      on intent."id"::text=grant_row."metadata"->>'purchase_intent_id'
     and intent."user_id"=p_user_id
     and intent."product_id"=grant_row."product_id"
     and intent."product_key"=provider_event."product_key"
     and intent."product_type"=p_grant_type
     and intent."provider"=provider_event."provider"
     and intent."provider_product_id"=provider_event."metadata"->>'provider_product_id'
     and intent."provider_product_id"=grant_row."metadata"->>'provider_product_id'
     and intent."environment"=provider_event."environment"
     and intent."environment"=grant_row."environment"
     and intent."status"='consumed'
     and intent."source_type"=case p_grant_type
       when 'watch_party_live_ticket' then 'watch_party_live'
       when 'event_pass' then 'event'
       when 'vip_pass' then 'vip_pass'
       when 'channel_subscription' then 'channel_subscription'
       when 'paid_content_access' then 'paid_content'
       else '__unsupported__' end
     and intent."source_id"=p_source_id
    join public."revenuecat_consumable_transaction_intents" transaction_link
      on transaction_link."purchase_intent_id"=intent."id"
     and transaction_link."provider"=provider_event."provider"
     and transaction_link."user_id"=p_user_id
     and transaction_link."product_id"=intent."product_id"
     and transaction_link."original_transaction_id"=grant_row."metadata"->>'original_transaction_id'
     and transaction_link."original_transaction_id"=provider_event."metadata"->>'original_transaction_id'
     and transaction_link."last_provider_event_id"=provider_event."id"
     and transaction_link."last_event_type"=provider_event."event_type"
     and transaction_link."last_occurred_at"=provider_event."occurred_at"
     and transaction_link."binding_state"='exact'
     and not transaction_link."terminal"
    where grant_row."user_id"=p_user_id
      and grant_row."grant_type"=p_grant_type
      and (p_expected_access_grant_id is null
        or grant_row."id"=p_expected_access_grant_id)
      and grant_row."source_type"='provider_event'
      and grant_row."source_id"=p_source_id
      and ((grant_row."status"='active' and grant_row."environment"='production')
        or (grant_row."status"='sandbox_only' and grant_row."environment"='sandbox'))
      and grant_row."starts_at"<=timezone('utc'::text,now())
      and (grant_row."expires_at" is null
        or grant_row."expires_at">timezone('utc'::text,now()))
      and grant_row."refunded_at" is null
      and grant_row."revoked_at" is null
      and provider_event."metadata"->>'purchase_intent_id'=intent."id"::text
      and provider_event."metadata"->>'access_grant_id'=grant_row."id"::text
      and nullif(pg_catalog.btrim(coalesce(
        provider_event."metadata"->>'original_transaction_id',''
      )),'') is not null
      -- The active purchase/renewal ledger is the immutable quote evidence.
      -- A later cancellation event can legitimately omit product/price fields,
      -- but it must never erase prepaid access before finite expiry.
      and exists (
        select 1 from public."money_access_ledger_events" purchase_ledger
        where purchase_ledger."user_id"=p_user_id
          and purchase_ledger."creator_id"=intent."creator_id"
          and purchase_ledger."product_id"=intent."product_id"
          and purchase_ledger."source_type"=intent."source_type"
          and purchase_ledger."source_id"=intent."source_id"
          and purchase_ledger."event_type" in (
            'INITIAL_PURCHASE','NON_RENEWING_PURCHASE','RENEWAL',
            'UNCANCELLATION','PRODUCT_CHANGE'
          )
          and purchase_ledger."status" in ('verified','sandbox_only')
          and purchase_ledger."metadata"->>'purchase_intent_id'=intent."id"::text
          and purchase_ledger."metadata"->>'original_transaction_id'
            =provider_event."metadata"->>'original_transaction_id'
          and coalesce(purchase_ledger."metadata"->>'reference_price_minor','')
            ~ '^[1-9][0-9]*$'
          and (purchase_ledger."metadata"->>'reference_price_minor')::integer
            =intent."amount_minor"
          and lower(coalesce(
            purchase_ledger."metadata"->>'reference_currency',''
          ))=lower(intent."currency")
      )
      and (
        (p_grant_type='watch_party_live_ticket' and exists (
          select 1 from public."paid_watch_party_offers" offer
          where offer."id"=p_source_id and offer."creator_id"=intent."creator_id"
        ))
        or (p_grant_type='event_pass' and exists (
          select 1 from public."paid_creator_events" offer
          where offer."creator_event_id"=p_source_id
            and offer."creator_id"=intent."creator_id"
        ))
        or (p_grant_type='vip_pass' and exists (
          select 1 from public."creator_vip_pass_offers" offer
          where offer."id"=p_source_id and offer."creator_id"=intent."creator_id"
        ))
        or (p_grant_type='channel_subscription' and exists (
          select 1 from public."creator_channel_subscription_offers" offer
          where offer."id"=p_source_id and offer."creator_id"=intent."creator_id"
        ))
        or (p_grant_type='paid_content_access' and exists (
          select 1 from public."videos" video
          where video."id"=p_source_id and video."owner_id"=intent."creator_id"
        ))
      )
      and not public."revenuecat_authority_quarantined_internal"(
        provider_event."provider",p_user_id,provider_event."environment"
      )
  ), ranked as (
    select candidate.*,count(*) over () as candidate_count
    from candidates candidate
  )
  select ranked.candidate_count,ranked."id",ranked."access_grant_id",
    ranked."provider",ranked."provider_product_id",ranked."environment"
  into v_count,v_intent_id,v_access_grant_id,v_provider,
    v_provider_product_id,v_environment
  from ranked
  order by ranked."id"
  limit 1;
  if coalesce(v_count,0)=0 then raise exception 'historical_purchase_identity_missing'; end if;
  if v_intent_id is null or v_access_grant_id is null
    or v_provider not in ('revenuecat_app_store','revenuecat_google_play')
    or nullif(pg_catalog.btrim(coalesce(v_provider_product_id,'')),'') is null
  then
    raise exception 'historical_purchase_identity_invalid';
  end if;
  return jsonb_build_object(
    'id',v_intent_id,'accessGrantId',v_access_grant_id,
    'provider',v_provider,'providerProductId',v_provider_product_id,
    'environment',v_environment
  );
end;
$$;
revoke all on function public."creator_money_historical_purchase_identity_internal"(
  uuid,text,uuid,uuid
) from public,anon,authenticated,service_role;

create or replace function public."creator_money_historical_purchase_identity_internal"(
  p_user_id uuid,
  p_grant_type text,
  p_source_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public."creator_money_historical_purchase_identity_internal"(
    p_user_id,p_grant_type,p_source_id,null
  );
$$;
revoke all on function public."creator_money_historical_purchase_identity_internal"(
  uuid,text,uuid
) from public,anon,authenticated,service_role;

-- Paid Video uses the same immutable identity, with no dependency on the
-- mutable current offer or platform selected for a future purchase.
create or replace function public."creator_video_existing_purchase_identity_internal"(
  p_user_id uuid,
  p_video_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public."creator_money_historical_purchase_identity_internal"(
    p_user_id,'paid_content_access',p_video_id
  );
$$;
revoke all on function public."creator_video_existing_purchase_identity_internal"(uuid,uuid)
  from public,anon,authenticated,service_role;

create or replace function public."can_read_creator_video_row"(
  p_owner_user_id text,
  p_visibility text,
  p_moderation_status text,
  p_scan_status text,
  p_storage_path text,
  p_storage_object_key text,
  p_playback_url text,
  p_viewer_user_id text default (auth.uid())::text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner text:=nullif(pg_catalog.btrim(coalesce(p_owner_user_id,'')),'');
  v_viewer text:=(auth.uid())::text;
  v_requested text:=nullif(pg_catalog.btrim(coalesce(p_viewer_user_id,'')),'');
  v_visibility text:=coalesce(nullif(pg_catalog.btrim(coalesce(p_visibility,'')),''),'draft');
  v_moderation text:=coalesce(nullif(pg_catalog.btrim(coalesce(p_moderation_status,'')),''),'clean');
  v_scan text:=coalesce(nullif(pg_catalog.btrim(coalesce(p_scan_status,'')),''),'pending_scan');
  v_video_ids uuid[];
  v_vip_required boolean:=false;
  v_price public."creator_content_prices"%rowtype;
  v_access jsonb;
begin
  if (v_requested is not null and v_requested is distinct from v_viewer) or v_owner is null then return false; end if;
  if v_viewer is not null and not public."wave1_current_caller_authority_internal"() then return false; end if;
  -- Ownership is not an exception to current account authority. Without this
  -- ordering a restricted owner with a still-valid JWT could keep reading
  -- source-bearing rows after suspension.
  if public."is_account_access_restricted"(v_owner)
    or (v_viewer is not null and public."is_account_access_restricted"(v_viewer))
  then return false; end if;
  if v_viewer is not null and v_viewer=v_owner then return true; end if;
  if
       v_moderation not in ('clean','reported')
    or not public."media_scan_public_safe"(v_scan)
    or not public."is_creator_video_playable_source"(p_storage_path,p_storage_object_key,p_playback_url)
    or (v_viewer is not null and public."is_creator_video_viewer_blocked"(v_owner,v_viewer))
    or not (
      v_visibility='public'
      or (v_visibility='circle' and v_viewer is not null
        and public."is_active_chilly_circle_member"(v_owner,v_viewer))
    )
  then return false; end if;

  select array_agg(video."id" order by video."id") into v_video_ids
  from public."videos" video
  where video."owner_id"::text=v_owner
    and video."storage_path" is not distinct from p_storage_path
    and video."storage_object_key" is not distinct from p_storage_object_key
    and video."playback_url" is not distinct from p_playback_url;
  if coalesce(cardinality(v_video_ids),0)<>1 then return false; end if;
  select coalesce(video."vip_access_required",false)
  into v_vip_required
  from public."videos" video
  where video."id"=v_video_ids[1]
    and video."quarantined_at" is null;
  if not found then return false; end if;

  select price.* into v_price
  from public."creator_content_prices" price
  where price."content_type"='creator_video'
    and price."content_id"=v_video_ids[1]
    and price."creator_id"::text=v_owner
  order by price."updated_at" desc,price."id" desc
  limit 1;
  if not v_vip_required
    and (v_price."id" is null or not coalesce(v_price."is_paid",false))
  then return true; end if;
  v_access:=public."resolve_creator_content_access"('creator_video',v_video_ids[1]);
  return coalesce((v_access->>'allowed')::boolean,false);
exception when others then
  return false;
end;
$$;

revoke all on function public."can_read_creator_video_row"(
  text,text,text,text,text,text,text,text
) from public,anon,authenticated,service_role;
grant execute on function public."can_read_creator_video_row"(
  text,text,text,text,text,text,text,text
) to anon,authenticated;

create or replace function public."creator_video_commerce_access_allowed"(p_video_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_resolution jsonb;
begin
  -- Rendition rows contain reusable source paths. Even an apparently free
  -- video must pass the canonical parent visibility, restriction, moderation,
  -- quarantine, scan, and playable-source checks before those paths are read.
  -- Never infer public safety from the absence of a commerce classification.
  v_resolution:=public."resolve_creator_content_access"('creator_video',p_video_id);
  return coalesce((v_resolution->>'allowed')::boolean,false);
exception when others then
  return false;
end;
$$;

revoke all on function public."creator_video_commerce_access_allowed"(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public."creator_video_commerce_access_allowed"(uuid)
  to anon,authenticated,service_role;

-- The player calls this visibility resolver before its VIP/Paid resolver. For
-- commerce-protected rows it therefore returns only safe public classification
-- and creator binding; it does not inspect any source URL/key/path. A free row
-- may inspect source only after public/Circle authority is established, and an
-- owner may inspect it only after exact caller ownership is established.
create or replace function public."resolve_creator_video_visibility_access"(
  p_video_id text,
  p_viewer_user_id text default (auth.uid())::text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_video_id uuid;
  v_viewer_user_id text:=(auth.uid())::text;
  v_requested_viewer_user_id text:=nullif(pg_catalog.btrim(coalesce(p_viewer_user_id,'')),'');
  v_owner_user_id text;
  v_visibility text:='draft';
  v_moderation_status text;
  v_scan_status text;
  v_quarantined_at timestamptz;
  v_vip_required boolean:=false;
  v_paid_required boolean:=false;
  v_is_owner boolean:=false;
  v_is_blocked boolean:=false;
  v_is_circle_member boolean:=false;
  v_has_playable_source boolean:=false;
  v_allowed boolean:=false;
  v_reason text:='unavailable';
begin
  if v_viewer_user_id is not null
    and not public."wave1_current_caller_authority_internal"()
  then
    return jsonb_build_object(
      'allowed',false,'visibility','draft','reason','session_authority_not_current',
      'is_owner',false,'is_blocked',false,'is_circle_member',false,
      'has_playable_source',false,'viewer_user_id',v_viewer_user_id,'owner_user_id',null
    );
  end if;
  if v_requested_viewer_user_id is not null
    and v_requested_viewer_user_id is distinct from v_viewer_user_id
  then
    return jsonb_build_object(
      'allowed',false,'visibility','draft','reason','viewer_identity_mismatch',
      'is_owner',false,'is_blocked',false,'is_circle_member',false,
      'has_playable_source',false,'viewer_user_id',v_viewer_user_id,'owner_user_id',null
    );
  end if;
  begin
    v_video_id:=nullif(pg_catalog.btrim(coalesce(p_video_id,'')),'')::uuid;
  exception when others then
    v_video_id:=null;
  end;
  if v_video_id is null then
    return jsonb_build_object(
      'allowed',false,'visibility','draft','reason','not_found',
      'is_owner',false,'is_blocked',false,'is_circle_member',false,
      'has_playable_source',false,'viewer_user_id',v_viewer_user_id,'owner_user_id',null
    );
  end if;

  select video."owner_id"::text,coalesce(nullif(video."visibility",''),'draft'),
    video."moderation_status",video."scan_status",video."quarantined_at",
    coalesce(video."vip_access_required",false)
  into v_owner_user_id,v_visibility,v_moderation_status,v_scan_status,
    v_quarantined_at,v_vip_required
  from public."videos" video
  where video."id"=v_video_id;
  if not found then
    return jsonb_build_object(
      'allowed',false,'visibility','draft','reason','not_found',
      'is_owner',false,'is_blocked',false,'is_circle_member',false,
      'has_playable_source',false,'viewer_user_id',v_viewer_user_id,'owner_user_id',null
    );
  end if;
  if v_visibility not in ('draft','circle','public') then v_visibility:='draft'; end if;
  v_is_owner:=v_viewer_user_id is not null and v_viewer_user_id=v_owner_user_id;
  if v_viewer_user_id is not null and not v_is_owner then
    v_is_blocked:=public."is_creator_video_viewer_blocked"(
      v_owner_user_id,v_viewer_user_id
    );
    v_is_circle_member:=public."is_active_chilly_circle_member"(
      v_owner_user_id,v_viewer_user_id
    );
  end if;

  if v_is_owner then
    -- Ownership is already established before the source-bearing helper runs.
    v_has_playable_source:=public."creator_video_playable_source_after_authority_internal"(v_video_id);
    v_allowed:=true;
    v_reason:='owner_allowed';
  elsif public."is_account_access_restricted"(v_owner_user_id)
    or v_quarantined_at is not null
  then
    v_reason:='unavailable';
  elsif v_is_blocked then
    v_reason:='blocked';
  elsif coalesce(v_moderation_status,'clean') not in ('clean','reported') then
    v_reason:='moderation_unavailable';
  elsif not public."media_scan_public_safe"(v_scan_status) then
    v_reason:='media_unavailable';
  elsif v_visibility='draft' then
    v_reason:='draft_owner_only';
  elsif v_visibility='circle' and v_viewer_user_id is null then
    v_reason:='signed_out_requires_circle';
  elsif v_visibility='circle' and not v_is_circle_member then
    v_reason:='circle_member_required';
  else
    select coalesce(price."is_paid",false)
    into v_paid_required
    from public."creator_content_prices" price
    where price."content_type"='creator_video'
      and price."content_id"=v_video_id
      and price."creator_id"::text=v_owner_user_id
    order by price."updated_at" desc,price."id" desc
    limit 1;
    v_paid_required:=coalesce(v_paid_required,false);
    if v_vip_required or v_paid_required then
      -- Safe public classification lets the client continue to the exact
      -- commerce resolver. No source-bearing field has been read here.
      if v_visibility='public' then
        v_allowed:=true;
        v_reason:='public_allowed';
      else
        v_reason:='unavailable';
      end if;
    else
      -- Public/Circle classification is the authority for explicitly free
      -- content, so the source read may occur only now.
      v_has_playable_source:=public."creator_video_playable_source_after_authority_internal"(v_video_id);
      if not v_has_playable_source then
        v_reason:='media_unavailable';
      elsif v_visibility='public' then
        v_allowed:=true;
        v_reason:='public_allowed';
      elsif v_visibility='circle' and v_is_circle_member then
        v_allowed:=true;
        v_reason:='circle_member_allowed';
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'allowed',v_allowed,'visibility',v_visibility,'reason',v_reason,
    'is_owner',v_is_owner,'is_blocked',v_is_blocked,
    'is_circle_member',v_is_circle_member,'has_playable_source',v_has_playable_source,
    'viewer_user_id',v_viewer_user_id,
    'owner_user_id',case when v_allowed or v_visibility='public' then v_owner_user_id else null end
  );
exception when others then
  return jsonb_build_object(
    'allowed',false,'visibility','draft','reason','unavailable',
    'is_owner',false,'is_blocked',false,'is_circle_member',false,
    'has_playable_source',false,'viewer_user_id',v_viewer_user_id,'owner_user_id',null
  );
end;
$$;
revoke all on function public."resolve_creator_video_visibility_access"(text,text)
  from public,anon,authenticated,service_role;
grant execute on function public."resolve_creator_video_visibility_access"(text,text)
  to anon,authenticated;

create or replace function public."resolve_creator_vip_video_access"(p_video_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid:=auth.uid();
  v_visibility jsonb;
  v_video_id uuid;
  v_owner_id uuid;
  v_vip_required boolean:=false;
  v_vip jsonb;
begin
  v_visibility:=public."resolve_creator_video_visibility_access"(
    p_video_id::text,(auth.uid())::text
  );
  if not coalesce((v_visibility->>'allowed')::boolean,false) then
    return jsonb_build_object(
      'allowed',false,'reason',coalesce(nullif(v_visibility->>'reason',''),'content_unavailable'),
      'vipRequired',true,'creatorId',null
    );
  end if;
  -- Read only classification/creator binding before VIP authority. Source
  -- fields remain untouched until exact creator entitlement succeeds.
  select video."id",video."owner_id",coalesce(video."vip_access_required",false)
  into v_video_id,v_owner_id,v_vip_required
  from public."videos" video
  where video."id"=p_video_id;
  if v_video_id is null then
    return jsonb_build_object('allowed',false,'reason','content_unavailable','vipRequired',true,'creatorId',null);
  end if;
  if not v_vip_required then
    return jsonb_build_object(
      'allowed',true,'reason','vip_not_required','vipRequired',false,
      'creatorId',v_owner_id
    );
  end if;
  if v_viewer is not null
    and (v_viewer=v_owner_id
      or public."has_platform_role"(array['owner'::text,'operator'::text]))
  then
    return jsonb_build_object(
      'allowed',true,'reason','owner','vipRequired',true,'creatorId',v_owner_id
    );
  end if;
  if v_viewer is null then
    return jsonb_build_object(
      'allowed',false,'reason','identity_required','vipRequired',true,
      'creatorId',v_owner_id
    );
  end if;
  begin
    v_vip:=public."resolve_creator_vip_pass_access"(v_owner_id);
  exception when others then
    v_vip:=null;
  end;
  if v_vip is not null
    and coalesce((v_vip->>'allowed')::boolean,false)
    and v_vip->>'reason'='vip_active'
    and nullif(v_vip->'offer'->>'creatorId','')::uuid is not distinct from v_owner_id
  then
    if not public."creator_video_playable_source_after_authority_internal"(p_video_id) then
      return jsonb_build_object(
        'allowed',false,'reason','content_unavailable','vipRequired',true,
        'creatorId',v_owner_id
      );
    end if;
    return jsonb_build_object(
      'allowed',true,'reason','vip_active','vipRequired',true,
      'creatorId',v_owner_id
    );
  end if;
  return jsonb_build_object(
    'allowed',false,
    'reason',case
      when v_vip is null then 'vip_authority_unresolved'
      else coalesce(nullif(v_vip->>'reason',''),'vip_authority_unresolved')
    end,
    'vipRequired',true,'creatorId',v_owner_id
  );
exception when others then
  return jsonb_build_object(
    'allowed',false,'reason','vip_authority_unresolved','vipRequired',true,'creatorId',null
  );
end;
$$;

revoke all on function public."resolve_creator_vip_video_access"(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public."resolve_creator_vip_video_access"(uuid)
  to anon,authenticated;

-- Clients may not toggle the protected-classification bit with direct table
-- writes. The SECURITY DEFINER setter remains the only authenticated path.
create or replace function public."guard_creator_video_vip_client_authority"()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_trusted boolean:=current_user in ('postgres','service_role','supabase_admin')
    or coalesce(auth.role(),'')='service_role';
begin
  if not v_trusted and (
    (tg_op='INSERT' and coalesce(new."vip_access_required",false))
    or (tg_op='UPDATE' and new."vip_access_required" is distinct from old."vip_access_required")
  ) then
    raise exception using errcode='42501',message='creator_video_vip_authority_server_owned';
  end if;
  return new;
end;
$$;

drop trigger if exists "zy_guard_creator_video_vip_client_authority" on public."videos";
create trigger "zy_guard_creator_video_vip_client_authority"
  before insert or update on public."videos"
  for each row execute function public."guard_creator_video_vip_client_authority"();
revoke all on function public."guard_creator_video_vip_client_authority"()
  from public,anon,authenticated,service_role;

create or replace function public."creator_video_has_unsigned_public_rendition_internal"(
  p_video_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public."media_renditions" rendition
    where rendition."source_type"='creator_video'
      and rendition."source_id"~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and rendition."source_id"::uuid=p_video_id
      and rendition."is_ready"
      and rendition."is_public_playback_safe"
      and rendition."visibility"='public'
      and not rendition."is_original"
      and rendition."delivery_provider"='cloudflare_r2_custom_domain'
      and rendition."bucket_role"='public_playback'
      and nullif(pg_catalog.btrim(coalesce(
        rendition."public_playback_path",rendition."manifest_path",''
      )),'') is not null
  );
$$;
revoke all on function public."creator_video_has_unsigned_public_rendition_internal"(uuid)
  from public,anon,authenticated,service_role;

create or replace function public."enforce_creator_video_protected_classification"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(new."vip_access_required",false) then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('creator-video-commerce:'||new."id"::text,0)
  );
  if new."visibility"<>'public' then
    raise exception 'vip_video_must_be_public';
  end if;
  if exists (
    select 1 from public."creator_content_prices" price
    where price."content_type"='creator_video'
      and price."content_id"=new."id"
      and coalesce(price."is_paid",false)
  ) then
    raise exception 'vip_video_cannot_be_paid_per_video';
  end if;
  if public."creator_video_has_unsigned_public_rendition_internal"(new."id") then
    raise exception 'protected_video_public_rendition_must_be_revoked';
  end if;
  return new;
end;
$$;

drop trigger if exists "enforce_creator_video_protected_classification_trigger" on public."videos";
create trigger "enforce_creator_video_protected_classification_trigger"
  before insert or update of "vip_access_required","visibility"
  on public."videos"
  for each row execute function public."enforce_creator_video_protected_classification"();
revoke all on function public."enforce_creator_video_protected_classification"()
  from public,anon,authenticated,service_role;

create or replace function public."block_paid_price_on_vip_video"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new."content_type"<>'creator_video' or not coalesce(new."is_paid",false) then
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('creator-video-commerce:'||new."content_id"::text,0)
  );
  if exists (
    select 1 from public."videos" video
    where video."id"=new."content_id"
      and coalesce(video."vip_access_required",false)
  ) then
    raise exception 'vip_video_cannot_be_paid_per_video';
  end if;
  if public."creator_video_has_unsigned_public_rendition_internal"(new."content_id") then
    raise exception 'protected_video_public_rendition_must_be_revoked';
  end if;
  return new;
end;
$$;

drop trigger if exists "block_paid_price_on_vip_video_trigger" on public."creator_content_prices";
create trigger "block_paid_price_on_vip_video_trigger"
  before insert or update of "is_paid","content_id","content_type"
  on public."creator_content_prices"
  for each row execute function public."block_paid_price_on_vip_video"();
revoke all on function public."block_paid_price_on_vip_video"()
  from public,anon,authenticated,service_role;

create or replace function public."block_unsigned_public_rendition_on_protected_video"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_video_id uuid;
begin
  if new."source_type"<>'creator_video'
    or not new."is_ready"
    or not new."is_public_playback_safe"
    or new."visibility"<>'public'
    or new."is_original"
    or new."delivery_provider"<>'cloudflare_r2_custom_domain'
    or new."bucket_role"<>'public_playback'
  then
    return new;
  end if;
  if new."source_id"!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'creator_video_rendition_source_id_invalid';
  end if;
  v_video_id:=new."source_id"::uuid;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('creator-video-commerce:'||v_video_id::text,0)
  );
  if exists (
    select 1 from public."videos" video
    where video."id"=v_video_id
      and (
        coalesce(video."vip_access_required",false)
        or exists (
          select 1 from public."creator_content_prices" price
          where price."content_type"='creator_video'
            and price."content_id"=video."id"
            and coalesce(price."is_paid",false)
        )
      )
  ) then
    raise exception 'protected_video_cannot_have_unsigned_public_rendition';
  end if;
  return new;
end;
$$;

drop trigger if exists "block_unsigned_public_rendition_on_protected_video_trigger"
  on public."media_renditions";
create trigger "block_unsigned_public_rendition_on_protected_video_trigger"
  before insert or update of
    "source_type","source_id","is_ready","is_public_playback_safe","visibility",
    "is_original","delivery_provider","storage_provider","storage_bucket","bucket_role",
    "public_playback_path","manifest_path","variant_playlist_path"
  on public."media_renditions"
  for each row execute function public."block_unsigned_public_rendition_on_protected_video"();
revoke all on function public."block_unsigned_public_rendition_on_protected_video"()
  from public,anon,authenticated,service_role;

create or replace function public."set_creator_video_vip_access"(
  p_video_id uuid,
  p_required boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid:=auth.uid();
  v_video public."videos"%rowtype;
begin
  if v_actor_id is null
    or not public."wave1_current_caller_authority_internal"()
    or public."is_account_access_restricted"(v_actor_id::text)
  then
    raise exception using errcode='42501',message='creator_video_current_session_required';
  end if;
  if coalesce(p_required,false) then
    perform public."wave1_assert_current_creator_money_authority_internal"();
  end if;
  select video.* into v_video
  from public."videos" video
  where video."id"=p_video_id
  for update;
  if v_video."id" is null or v_video."owner_id"<>v_actor_id then
    raise exception using errcode='42501',message='creator_video_owner_required';
  end if;
  if coalesce(p_required,false) and v_video."visibility"<>'public' then
    return jsonb_build_object('status','blocked','reason','vip_video_must_be_public');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('creator-video-commerce:'||p_video_id::text,0)
  );
  if coalesce(p_required,false)
    and public."creator_video_has_unsigned_public_rendition_internal"(p_video_id)
  then
    return jsonb_build_object(
      'status','blocked','reason','protected_video_public_rendition_must_be_revoked'
    );
  end if;
  if coalesce(p_required,false) then
    update public."creator_content_prices"
    set "is_paid"=false,
        "status"='paused',
        "updated_at"=timezone('utc'::text,now())
    where "content_type"='creator_video'
      and "content_id"=p_video_id
      and "creator_id"=v_actor_id;
  end if;
  update public."videos"
  set "vip_access_required"=coalesce(p_required,false),
      "updated_at"=timezone('utc'::text,now())
  where "id"=p_video_id
    and "owner_id"=v_actor_id;
  return jsonb_build_object(
    'status','ok','videoId',p_video_id,
    'vipRequired',coalesce(p_required,false),
    'paidVideoDisabled',coalesce(p_required,false)
  );
end;
$$;

revoke all on function public."set_creator_video_vip_access"(uuid,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public."set_creator_video_vip_access"(uuid,boolean)
  to authenticated;

-- Public CDN rendition metadata is source-bearing authority. Proof-demo rows
-- retain their historical public policy; creator-video rows require the exact
-- unified VIP/Paid/free resolver before path columns can be selected.
drop policy if exists "media_renditions_select_public_safe_metadata"
  on public."media_renditions";
create policy "media_renditions_select_public_safe_metadata"
  on public."media_renditions"
  for select
  to anon,authenticated
  using (
    "is_ready"=true
    and "is_public_playback_safe"=true
    and "visibility"='public'
    and "is_original"=false
    and "delivery_provider"='cloudflare_r2_custom_domain'
    and "storage_provider"='cloudflare_r2'
    and "bucket_role"='public_playback'
    and "scan_status" in ('clean','approved')
    and "moderation_status" in ('clean','approved','allowed')
    and "public_playback_path" like 'playback/public/%'
    and "public_playback_path" !~ '(^|/)(originals?|masters?|sources?|uploads|private|premium|processing|moderation[-_]blocked|unscanned)(/|$)'
    and (
      "source_type"='proof_demo'
      or (
        "source_type"='creator_video'
        and "source_id"~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and public."creator_video_commerce_access_allowed"("source_id"::uuid)
      )
    )
  );

-- Do not silently deploy over a known reusable unsigned URL. A deployment
-- operator must first revoke/move any such object, then apply this migration.
do $$
begin
  if exists (
    select 1
    from public."videos" video
    where (
      coalesce(video."vip_access_required",false)
      or exists (
        select 1 from public."creator_content_prices" price
        where price."content_type"='creator_video'
          and price."content_id"=video."id"
          and coalesce(price."is_paid",false)
      )
    )
      and public."creator_video_has_unsigned_public_rendition_internal"(video."id")
  ) then
    raise exception 'protected_creator_video_has_reusable_public_rendition';
  end if;
end;
$$;
