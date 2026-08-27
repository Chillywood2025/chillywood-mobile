-- A completed provider purchase is immutable buyer authority. Catalog offers,
-- seller payout readiness, and subscription-slot assignments control future
-- sales; they must not silently revoke an active, unrefunded projection.
-- Resolve each projection through its exact access grant/provider chain and its
-- own historical offer rather than through whichever offer was edited last.

create or replace function public."resolve_paid_watch_party_ticket_access"(
  p_party_id text
)
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
  if v_user is not null
    and public."wave1_current_caller_authority_internal"()
    and not public."is_account_access_restricted"(v_user::text)
  then
    select room.* into v_room
    from public."watch_party_rooms" room
    where room."party_id"=p_party_id;

    if v_room."party_id" is not null
      and coalesce(v_room."is_active",false)
      and v_room."room_type"='title'
      and not public."watch_party_room_actor_blocked_by_host"(p_party_id,v_user::text)
    then
      for v_ticket in
        select ticket.*
        from public."paid_watch_party_tickets" ticket
        join public."paid_watch_party_offers" offer
          on offer."id"=ticket."offer_id"
         and offer."party_id"=ticket."party_id"
        where ticket."party_id"=p_party_id
          and ticket."buyer_id"=v_user
          and ticket."status"='active'
          and ticket."refunded_at" is null
          and ticket."revoked_at" is null
          and (ticket."expires_at" is null
            or ticket."expires_at">timezone('utc'::text,now()))
          and offer."status" not in ('blocked','canceled')
          and not public."is_account_access_restricted"(offer."creator_id"::text)
        order by ticket."created_at" desc,ticket."id" desc
      loop
        select offer.* into v_offer
        from public."paid_watch_party_offers" offer
        where offer."id"=v_ticket."offer_id"
          and offer."party_id"=p_party_id;
        begin
          v_identity:=public."creator_money_historical_purchase_identity_internal"(
            v_user,'watch_party_live_ticket',v_offer."id",v_ticket."access_grant_id"
          );
        exception when others then
          v_identity:=null;
        end;
        if v_identity is not null then
          return jsonb_build_object(
            'allowed',true,'reason','ticket_confirmed','requiresPurchase',false,
            'ticketId',v_ticket."id",
            'offer',public."paid_watch_party_offer_safe_row"(v_offer)
          );
        end if;
      end loop;
    end if;
  end if;
  return public."resolve_paid_watch_party_ticket_access_pre_historical_closeout"(
    p_party_id
  );
end;
$$;
revoke all on function public."resolve_paid_watch_party_ticket_access"(text)
  from public,anon,authenticated,service_role;
grant execute on function public."resolve_paid_watch_party_ticket_access"(text)
  to authenticated,service_role;

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
  if v_user is not null
    and public."wave1_current_caller_authority_internal"()
    and not public."is_account_access_restricted"(v_user::text)
  then
    select event.* into v_event
    from public."creator_events" event
    where event."id"=p_creator_event_id;

    if v_event."id" is not null
      and v_event."status" not in (
        'ended','expired','canceled','removed','unsafe','blocked'
      )
    then
      for v_pass in
        select pass_row.*
        from public."paid_creator_event_passes" pass_row
        join public."paid_creator_events" offer
          on offer."id"=pass_row."event_id"
        where offer."creator_event_id"=p_creator_event_id
          and pass_row."buyer_id"=v_user
          and pass_row."status"='active'
          and pass_row."refunded_at" is null
          and pass_row."revoked_at" is null
          and (pass_row."expires_at" is null
            or pass_row."expires_at">timezone('utc'::text,now()))
          and offer."status" not in ('blocked','canceled')
          and not public."is_account_access_restricted"(offer."creator_id"::text)
          and not exists (
            select 1 from public."channel_audience_blocks" block_row
            where (block_row."channel_user_id"=offer."creator_id"::text
                and block_row."blocked_user_id"=v_user::text)
               or (block_row."channel_user_id"=v_user::text
                and block_row."blocked_user_id"=offer."creator_id"::text)
          )
        order by pass_row."created_at" desc,pass_row."id" desc
      loop
        select offer.* into v_offer
        from public."paid_creator_events" offer
        where offer."id"=v_pass."event_id"
          and offer."creator_event_id"=p_creator_event_id;
        begin
          v_identity:=public."creator_money_historical_purchase_identity_internal"(
            v_user,'event_pass',p_creator_event_id,v_pass."access_grant_id"
          );
        exception when others then
          v_identity:=null;
        end;
        if v_identity is not null then
          return jsonb_build_object(
            'allowed',true,'reason','event_pass_confirmed',
            'requiresPurchase',false,'passId',v_pass."id",
            'offer',public."paid_creator_event_safe_row"(v_offer)
          );
        end if;
      end loop;
    end if;
  end if;
  return public."resolve_paid_creator_event_pass_access_pre_historical_closeout"(
    p_creator_event_id
  );
end;
$$;
revoke all on function public."resolve_paid_creator_event_pass_access"(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public."resolve_paid_creator_event_pass_access"(uuid)
  to authenticated,service_role;

create or replace function public."resolve_creator_vip_pass_access"(
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
  v_offer public."creator_vip_pass_offers"%rowtype;
  v_pass public."creator_vip_passes"%rowtype;
  v_identity jsonb;
begin
  if v_user is not null
    and public."wave1_current_caller_authority_internal"()
    and not public."is_account_access_restricted"(v_user::text)
    and not public."is_account_access_restricted"(p_creator_id::text)
    and not exists (
      select 1 from public."channel_audience_blocks" block_row
      where (block_row."channel_user_id"=p_creator_id::text
          and block_row."blocked_user_id"=v_user::text)
         or (block_row."channel_user_id"=v_user::text
          and block_row."blocked_user_id"=p_creator_id::text)
    )
  then
    for v_pass in
      select pass_row.*
      from public."creator_vip_passes" pass_row
      join public."creator_vip_pass_offers" offer
        on offer."id"=pass_row."offer_id"
       and offer."creator_id"=pass_row."creator_id"
      where offer."creator_id"=p_creator_id
        and pass_row."fan_id"=v_user
        and pass_row."status"='active'
        and pass_row."refunded_at" is null
        and pass_row."revoked_at" is null
        and (pass_row."expires_at" is null
          or pass_row."expires_at">timezone('utc'::text,now()))
        and offer."status"<>'blocked'
      order by pass_row."created_at" desc,pass_row."id" desc
    loop
      select offer.* into v_offer
      from public."creator_vip_pass_offers" offer
      where offer."id"=v_pass."offer_id"
        and offer."creator_id"=p_creator_id;
      begin
        v_identity:=public."creator_money_historical_purchase_identity_internal"(
          v_user,'vip_pass',v_offer."id",v_pass."access_grant_id"
        );
      exception when others then
        v_identity:=null;
      end;
      if v_identity is not null then
        return jsonb_build_object(
          'allowed',true,'reason','vip_active','requiresPurchase',false,
          'vipPassId',v_pass."id",
          'offer',public."creator_vip_pass_offer_safe_row"(v_offer)
        );
      end if;
    end loop;
  end if;
  return public."resolve_creator_vip_pass_access_pre_historical_closeout"(
    p_creator_id
  );
end;
$$;
revoke all on function public."resolve_creator_vip_pass_access"(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public."resolve_creator_vip_pass_access"(uuid)
  to authenticated,service_role;

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
  if v_user is not null
    and public."wave1_current_caller_authority_internal"()
    and not public."is_account_access_restricted"(v_user::text)
    and not public."is_account_access_restricted"(p_creator_id::text)
    and not exists (
      select 1 from public."channel_audience_blocks" block_row
      where (block_row."channel_user_id"=p_creator_id::text
          and block_row."blocked_user_id"=v_user::text)
         or (block_row."channel_user_id"=v_user::text
          and block_row."blocked_user_id"=p_creator_id::text)
    )
  then
    for v_subscription in
      select subscription.*
      from public."creator_channel_subscriptions" subscription
      join public."creator_channel_subscription_offers" offer
        on offer."id"=subscription."offer_id"
       and offer."creator_id"=subscription."creator_id"
      where offer."creator_id"=p_creator_id
        and subscription."subscriber_id"=v_user
        and subscription."status" in (
          'active','trialing','grace_period','cancel_pending'
        )
        and subscription."current_period_end" is not null
        and subscription."current_period_end">timezone('utc'::text,now())
        and subscription."revoked_at" is null
        and subscription."expired_at" is null
        and offer."status"<>'blocked'
      order by subscription."updated_at" desc,subscription."id" desc
    loop
      select offer.* into v_offer
      from public."creator_channel_subscription_offers" offer
      where offer."id"=v_subscription."offer_id"
        and offer."creator_id"=p_creator_id;
      begin
        v_identity:=public."creator_money_historical_purchase_identity_internal"(
          v_user,'channel_subscription',v_offer."id",
          v_subscription."access_grant_id"
        );
      exception when others then
        v_identity:=null;
      end;
      if v_identity is not null then
        return jsonb_build_object(
          'allowed',true,
          'reason',case when v_subscription."status"='cancel_pending'
            then 'subscription_cancel_pending' else 'subscription_active' end,
          'requiresPurchase',false,
          'subscriptionId',v_subscription."id",
          'subscriptionStatus',v_subscription."status",
          'currentPeriodEnd',v_subscription."current_period_end",
          'offer',public."channel_subscription_offer_safe_row"(v_offer)
        );
      end if;
    end loop;
  end if;
  return public."resolve_creator_channel_subscription_access_pre_historical_closeout"(
    p_creator_id
  );
end;
$$;
revoke all on function public."resolve_creator_channel_subscription_access"(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public."resolve_creator_channel_subscription_access"(uuid)
  to authenticated,service_role;

comment on function public."resolve_creator_channel_subscription_access"(uuid) is
  'Resolves each exact current provider-backed subscription projection through its historical creator offer; finite prepaid access survives sale pause, offer replacement, and payout-readiness changes but not block, expiry, refund, or revocation.';
