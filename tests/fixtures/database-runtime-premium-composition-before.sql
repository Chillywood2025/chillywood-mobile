-- Exact two-function before-control extracted from reviewed repair SHA256
-- 4822b53c30a3820d5e0f7c95a35d1c284cce1f0f628a896f46a57cf4e758cbde.
-- Disposable test databases only: reproduces the initially repaired composition gaps.

CREATE OR REPLACE FUNCTION public.resolve_watch_party_livekit_authority_pre_service_fix(p_party_id text, p_user_id uuid, p_session_generation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz:=timezone('utc'::text,now());
  v_paid_required boolean := false;
  v_allowed boolean := false;
  v_is_host boolean := false;
  v_expires_at timestamptz;
  v_room public."watch_party_rooms"%rowtype;
begin
  if p_party_id is distinct from upper(btrim(coalesce(p_party_id, '')))
    or p_user_id is null or p_session_generation is null
    or nullif(trim(coalesce(p_party_id,'')),'') is null
    or public."is_account_access_restricted"(p_user_id::text)
    or not public."money_purchase_intent_session_authorized_internal"(
      p_user_id,p_session_generation::text
    )
  then
    return jsonb_build_object('allowed',false,'paidSeatRequired',false,'hostAuthority',false,'expiresAt',null,'reason','viewer_authority_invalid');
  end if;
  select room.* into v_room from public."watch_party_rooms" room
  where room."party_id"=p_party_id;
  if v_room."party_id" is null
    or not exists (select 1 from auth.users subject
      where subject.id=p_user_id and subject.deleted_at is null)
    or not exists (select 1 from auth.users subject
      where subject.id=v_room."host_user_id" and subject.deleted_at is null)
    or public."is_account_access_restricted"(v_room."host_user_id"::text)
  then
    return jsonb_build_object('allowed',false,'paidSeatRequired',false,
      'hostAuthority',false,'expiresAt',null,'reason','viewer_authority_invalid');
  end if;
  select exists (
    select 1 from public."paid_watch_party_offers" offer
    where offer."party_id"=p_party_id
      and offer."status" in ('sandbox','active','paused','sold_out','blocked')
  ) into v_paid_required;
  select exists (
    select 1 from public."watch_party_rooms" room
    where room."party_id"=p_party_id and room."host_user_id"=p_user_id
  ) into v_is_host;
  if v_is_host and v_paid_required and (
    public."revenuecat_authority_quarantined_internal"(null,p_user_id,null)
    or not public."wave1_creator_money_subject_authorized_internal"(p_user_id)
    or not exists (
      select 1 from public."paid_watch_party_offers" offer
      where offer."party_id"=p_party_id and offer."creator_id"=p_user_id
        and offer."status" in ('sandbox','active','sold_out')
        and (offer."starts_at" is null or offer."starts_at"<=v_now)
        and (offer."ends_at" is null or offer."ends_at">v_now)
    )
  ) then
    return jsonb_build_object(
      'allowed',false,'paidSeatRequired',true,'hostAuthority',true,
      'expiresAt',null,'reason','paid_room_host_creator_authority_required'
    );
  end if;
  v_allowed := public."watch_party_room_self_access_allowed_internal"(p_party_id,p_user_id::text);
  if not v_allowed then
    return jsonb_build_object(
      'allowed',false,'paidSeatRequired',v_paid_required,'hostAuthority',v_is_host,'expiresAt',null,
      'reason',case when v_paid_required then 'exact_paid_seat_authority_required' else 'room_viewer_authority_required' end
    );
  end if;
  if v_is_host then
    if v_paid_required then
      select least(coalesce(max(offer."ends_at"),v_now+interval '30 seconds'),v_now+interval '30 seconds')
      into v_expires_at
      from public."paid_watch_party_offers" offer
      where offer."party_id"=p_party_id
        and offer."creator_id"=p_user_id
        and offer."status" in ('sandbox','active','sold_out')
        and (offer."starts_at" is null or offer."starts_at"<=v_now)
        and (offer."ends_at" is null or offer."ends_at">v_now);
      v_expires_at:=least(v_expires_at,
        (select session.not_after from auth.sessions session
          where session.id=p_session_generation and session.user_id=p_user_id));
      return jsonb_build_object(
        'allowed',true,'paidSeatRequired',true,'hostAuthority',true,
        'expiresAt',v_expires_at,'reason','paid_room_host_authority'
      );
    end if;
    return jsonb_build_object(
      'allowed',true,'paidSeatRequired',false,'hostAuthority',true,
      'expiresAt',null,'reason','non_seat_room_host_authority'
    );
  end if;
  if not v_paid_required then
    return jsonb_build_object('allowed',true,'paidSeatRequired',false,'hostAuthority',false,'expiresAt',null,'reason','non_seat_room_authority');
  end if;

    select least(ticket."expires_at",grant_row."expires_at",offer."ends_at") into v_expires_at
    from public."access_grants" grant_row
    join public."paid_watch_party_offers" offer
      on offer."id" = grant_row."source_id"
     and offer."party_id" = p_party_id
     and offer."creator_id" = v_room."host_user_id"
     and offer."host_id" = v_room."host_user_id"
    join public."monetization_products" product
      on product."id" = grant_row."product_id"
     and product."product_type" = 'watch_party_live_ticket'
    join public."provider_events" provider_event
      on provider_event."id" = grant_row."provider_event_id"
     and provider_event."provider" in ('revenuecat_app_store','revenuecat_google_play')
     and provider_event."provider" = grant_row."provider"
     and provider_event."product_id" = grant_row."product_id"
     and provider_event."environment" = grant_row."environment"
     and provider_event."status" = 'processed'
     and provider_event."user_id"::text = p_user_id::text
     and not public."revenuecat_authority_quarantined_internal"(
       provider_event."provider",provider_event."user_id",provider_event."environment"
     )
    join public."money_purchase_intents" intent
      on intent."id"::text = grant_row."metadata"->>'purchase_intent_id'
     and intent."id"::text = provider_event."metadata"->>'purchase_intent_id'
     and intent."user_id"::text = p_user_id::text
     and intent."product_id" = grant_row."product_id"
     and intent."product_key" = product."product_key"
     and intent."product_type" = 'watch_party_live_ticket'
     and intent."source_type" = 'watch_party_live'
     and intent."environment" = grant_row."environment"
     and intent."consumed_at" is not null
     and intent."revoked_at" is null
     and intent."amount_minor" = offer."price_cents"
     and lower(intent."currency") = lower(offer."currency")
     and intent."source_id" = offer."id"
     and intent."creator_id" = offer."creator_id"
     and intent."provider" = provider_event."provider"
     and intent."provider_product_id" = provider_event."metadata"->>'provider_product_id'
     and intent."status" = 'consumed'
    join public."revenuecat_consumable_transaction_intents" transaction_link
      on transaction_link."purchase_intent_id" = intent."id"
     and transaction_link."provider" = provider_event."provider"
     and transaction_link."original_transaction_id" = grant_row."metadata"->>'original_transaction_id'
     and transaction_link."original_transaction_id" = provider_event."metadata"->>'original_transaction_id'
     and nullif(btrim(transaction_link."original_transaction_id"),'') is not null
     and transaction_link."user_id" = grant_row."user_id"
     and transaction_link."product_id" = grant_row."product_id"
     and transaction_link."provider_event_id" = provider_event."id"
     and transaction_link."binding_state" = 'exact'
     and not transaction_link."terminal"
    join public."paid_watch_party_tickets" ticket
      on ticket."access_grant_id"=grant_row."id"
     and ticket."offer_id"=offer."id"
     and ticket."party_id"=offer."party_id"
     and ticket."buyer_id"=grant_row."user_id"
     and ticket."creator_id"=offer."creator_id"
     and ticket."host_id"=offer."host_id"
     and ticket."provider"=grant_row."provider"
     and ticket."provider_transaction_id"=provider_event."provider_event_id"
     and ticket."metadata"->'viewer_access_only' = 'true'::jsonb
     and coalesce(ticket."metadata"->'grants_livekit_publish','false'::jsonb) = 'false'::jsonb
     and coalesce(ticket."metadata"->'grants_host_authority','false'::jsonb) = 'false'::jsonb
     and ticket."status"='active'
     and ticket."refunded_at" is null
     and ticket."revoked_at" is null
     and (ticket."expires_at" is null or ticket."expires_at">timezone('utc'::text,now()))
    where grant_row."user_id"::text = p_user_id::text
      and grant_row."grant_type" = 'watch_party_live_ticket'
      and grant_row."source_type" = 'provider_event'
      and grant_row."environment" in ('sandbox','production')
      and grant_row."status" in ('active','sandbox_only')
      and grant_row."starts_at" <= timezone('utc'::text, now())
      and (grant_row."expires_at" is null or grant_row."expires_at" > timezone('utc'::text, now()))
      and grant_row."refunded_at" is null
      and grant_row."revoked_at" is null
      and offer."status" in ('sandbox','active','sold_out')
      and (offer."starts_at" is null or offer."starts_at" <= timezone('utc'::text, now()))
      and (offer."ends_at" is null or offer."ends_at" > timezone('utc'::text, now()))
      and coalesce((grant_row."metadata"->>'viewer_access_only')::boolean, false)
      and not coalesce((grant_row."metadata"->>'authority_granted')::boolean, false)
      and not coalesce((grant_row."metadata"->>'speaker_authority')::boolean, false)
      and not coalesce((grant_row."metadata"->>'moderator_authority')::boolean, false)
      and not coalesce((grant_row."metadata"->>'payout_access')::boolean, false)
      and not coalesce((grant_row."metadata"->>'premium_unlock')::boolean, false)
      and public."wave1_creator_money_subject_authorized_internal"(offer."creator_id")
    order by grant_row."created_at" desc,grant_row."id" desc limit 1;
  if not found then
    return jsonb_build_object('allowed',false,'paidSeatRequired',true,
      'hostAuthority',false,'expiresAt',null,'reason','exact_paid_seat_authority_required');
  end if;
  v_expires_at:=least(coalesce(v_expires_at,v_now+interval '30 seconds'),
    v_now+interval '30 seconds',
    (select session.not_after from auth.sessions session
      where session.id=p_session_generation and session.user_id=p_user_id));
  return jsonb_build_object(
    'allowed',true,'paidSeatRequired',true,'hostAuthority',false,'expiresAt',v_expires_at,
    'reason','exact_paid_seat_viewer_authority'
  );
end;
$function$;

create or replace function public.resolve_watch_party_livekit_viewer_authority(p_party_id text,p_user_id uuid,p_session_generation uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.watch_party_rooms; baseline jsonb;
begin
  select * into r from public.watch_party_rooms where party_id=p_party_id;
  if p_party_id is distinct from upper(btrim(coalesce(p_party_id,'')))
    or r.party_id is null or p_user_id is null
    or not exists(select 1 from auth.users subject where subject.id=p_user_id and subject.deleted_at is null)
    or not exists(select 1 from auth.users subject where subject.id=r.host_user_id and subject.deleted_at is null)
    or public.is_account_access_restricted(p_user_id::text)
    or public.is_account_access_restricted(r.host_user_id::text)
  then
    return jsonb_build_object('allowed',false,'paidSeatRequired',false,
      'speakerEligible',false,'hostAuthority',false,'expiresAt',null,'reason','viewer_authority_invalid');
  end if;
  baseline:=public.resolve_watch_party_livekit_pre_party_room(p_party_id,p_user_id,p_session_generation);
  select * into r from public.watch_party_rooms where party_id=upper(nullif(btrim(p_party_id),''));
  -- The old free-room Premium predicate calls user_has_active_entitlement,
  -- which requires the viewer's JWT even when this service-only RPC receives
  -- an exact target session. Correct only that demonstrated false negative for
  -- current canonical Party Room publications, using target authority directly.
  if baseline->>'allowed' is distinct from 'true' then
    if auth.role()='service_role' and baseline->>'reason'='room_viewer_authority_required'
      and r.room_type='title' and r.content_access_rule in ('premium','party_pass')
      and p_session_generation is not null and p_user_id is not null
      and not coalesce((baseline->>'paidSeatRequired')::boolean,true)
      and not exists(select 1 from public.paid_watch_party_offers o where o.party_id=r.party_id
        and o.status in ('sandbox','active','paused','sold_out','blocked'))
      and public.money_purchase_intent_session_authorized_internal(p_user_id,p_session_generation::text)
      and private.party_room_publication_current(r.party_id)
      and not public.is_account_access_restricted(p_user_id::text)
      and not public.watch_party_room_actor_blocked_by_host(r.party_id,p_user_id::text)
      and private.party_room_viewer_source_allowed(r,p_user_id)
      and exists(select 1 from public.watch_party_room_memberships m where m.party_id=r.party_id and m.user_id=p_user_id::text
        and m.membership_state in ('active','reconnecting') and m.left_at is null and m.last_seen_at>=now()-interval '45 seconds')
    then
      return jsonb_build_object('allowed',true,'paidSeatRequired',false,'speakerEligible',true,
        'hostAuthority',r.host_user_id=p_user_id,'expiresAt',least(now()+interval '30 seconds',
          (select s.not_after from auth.sessions s where s.id=p_session_generation and s.user_id=p_user_id),
          (select min(e.expires_at) from public.user_entitlements e where e.user_id in (p_user_id::text,r.host_user_id::text)
            and e.entitlement_key='premium' and e.expires_at>now())),
        'reason','canonical_party_room_target_premium_authority');
    end if;
    return baseline;
  end if;
  if not private.party_room_viewer_source_allowed(r,p_user_id) then
    return jsonb_build_object('allowed',false,'paidSeatRequired',coalesce((baseline->>'paidSeatRequired')::boolean,false),
      'speakerEligible',false,'hostAuthority',false,'expiresAt',null,'reason','room_viewer_authority_required');
  end if;
  return baseline;
end $$;
