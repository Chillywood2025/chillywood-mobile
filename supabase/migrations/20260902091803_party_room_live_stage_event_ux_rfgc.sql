-- Party Room / Live Stage / Event monetization UX closure.
--
-- Internal product, provider, grant, settlement, and LiveKit identities remain
-- unchanged. This successor closes the paid-entry-before-seat dependency and
-- persists host-reviewed seat states without granting room or media authority.

alter table public."paid_live_watch_party_passes"
  add column if not exists "requested_at" timestamptz;
alter table public."paid_live_watch_party_passes"
  drop constraint if exists "paid_live_watch_party_passes_request_type_check";
alter table public."paid_live_watch_party_passes"
  add constraint "paid_live_watch_party_passes_request_type_check" check (
    "pass_type"='live_watch_party_seat_pass' or "requested_at" is null
  );
alter table public."paid_live_watch_party_passes"
  drop constraint if exists "paid_live_watch_party_passes_pending_request_check";
alter table public."paid_live_watch_party_passes"
  add constraint "paid_live_watch_party_passes_pending_request_check" check (
    "requested_at" is null
    or ("reviewed_at" is null and "approved_at" is null and "rejected_at" is null)
  );

alter table public."notifications" drop constraint if exists "notifications_notification_type_check";
alter table public."notifications" add constraint "notifications_notification_type_check" check ("notification_type" in (
  'followed_creator_live','circle_friend_live','event_starts_soon','watch_party_starts_soon','public_upload',
  'replay_later','creator_went_live','upcoming_event_reminder','new_message','access_granted','content_dropped',
  'reply_comment','moderation_notice','payment_access_confirmation','chilly_chat_call','chilly_chat_missed_call',
  'paid_video_unlocked','watch_party_ticket_ready','live_watch_party_access_ready','live_watch_party_seat_eligible',
  'live_watch_party_seat_requested','live_watch_party_seat_approved','live_watch_party_seat_rejected',
  'channel_subscription_active','vip_access_active','event_pass_active','tip_sent_receipt','paid_video_sold',
  'watch_party_ticket_sold','live_watch_party_access_sold','live_watch_party_seat_sold',
  'channel_subscription_started','vip_pass_sold','event_pass_sold','tip_received','creator_money_refunded',
  'creator_money_revoked','event_pass_event_starts_soon','watch_party_ticket_room_starts_soon','payout_readiness_updated'
));

create or replace function public."has_exact_live_watch_party_pass_internal"(
  p_party_id text,
  p_user_id uuid,
  p_pass_type text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select p_pass_type in ('live_watch_party_access_pass','live_watch_party_seat_pass')
    and exists (
      select 1
      from public."paid_live_watch_party_offers" offer
      join public."paid_live_watch_party_passes" pass_row
        on pass_row."offer_id"=offer."id"
       and pass_row."party_id"=offer."party_id"
       and pass_row."creator_id"=offer."creator_id"
       and pass_row."pass_type"=offer."pass_type"
      join public."access_grants" grant_row
        on grant_row."id"=pass_row."access_grant_id"
       and grant_row."user_id"=pass_row."buyer_id"
       and grant_row."source_id"=offer."id"
       and grant_row."grant_type"=offer."pass_type"
      join public."provider_events" provider_event
        on provider_event."id"=pass_row."provider_event_id"
       and provider_event."user_id"=pass_row."buyer_id"
       and provider_event."environment"=grant_row."environment"
      where offer."party_id"=trim(coalesce(p_party_id,''))
        and offer."pass_type"=p_pass_type
        and offer."status" in ('sandbox','active')
        and (offer."starts_at" is null or offer."starts_at"<=timezone('utc'::text,now()))
        and (offer."ends_at" is null or offer."ends_at">timezone('utc'::text,now()))
        and pass_row."buyer_id"=p_user_id
        and pass_row."status"='active'
        and pass_row."revoked_at" is null
        and pass_row."refunded_at" is null
        and grant_row."status" in ('active','sandbox_only')
        and grant_row."revoked_at" is null
        and grant_row."refunded_at" is null
        and grant_row."starts_at"<=timezone('utc'::text,now())
        and (grant_row."expires_at" is null or grant_row."expires_at">timezone('utc'::text,now()))
        and provider_event."status"='processed'
        and not public."revenuecat_authority_quarantined_internal"(
          provider_event."provider",p_user_id,provider_event."environment"
        )
    );
$$;
revoke all on function public."has_exact_live_watch_party_pass_internal"(text,uuid,text)
  from public,anon,authenticated,service_role;

create or replace function public."list_live_watch_party_seat_states_for_host"(
  p_party_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_host uuid:=auth.uid();
  v_party text:=trim(coalesce(p_party_id,''));
  v_room public."watch_party_rooms"%rowtype;
  v_states jsonb;
begin
  if v_host is null or not public."wave1_current_caller_authority_internal"()
    or public."is_account_access_restricted"(v_host::text)
  then raise exception 'host_session_authority_required'; end if;
  select room.* into v_room
  from public."watch_party_rooms" room
  where room."party_id"=v_party and room."room_type"='live'
    and coalesce(room."is_active",false) and room."host_user_id"=v_host;
  if v_room."party_id" is null then raise exception 'exact_live_stage_host_required'; end if;

  select coalesce(jsonb_object_agg(state_row."buyer_id"::text,state_row."seat_state"),'{}'::jsonb)
  into v_states
  from (
    select distinct on (pass_row."buyer_id")
      pass_row."buyer_id",
      case
        when pass_row."approved_at" is not null
          and membership."membership_state" in ('active','reconnecting')
          and membership."stage_role"='speaker' and membership."can_speak"
          then 'approved'
        when pass_row."requested_at" is not null then 'requested'
        when pass_row."rejected_at" is not null then 'rejected'
        else 'eligible'
      end as "seat_state"
    from public."paid_live_watch_party_passes" pass_row
    join public."paid_live_watch_party_offers" offer
      on offer."id"=pass_row."offer_id"
     and offer."party_id"=pass_row."party_id"
     and offer."creator_id"=pass_row."creator_id"
     and offer."pass_type"=pass_row."pass_type"
    left join public."watch_party_room_memberships" membership
      on membership."party_id"=pass_row."party_id"
     and membership."user_id"=pass_row."buyer_id"::text
    where pass_row."party_id"=v_party
      and pass_row."creator_id"=v_host
      and pass_row."pass_type"='live_watch_party_seat_pass'
      and pass_row."status"='active'
      and offer."host_user_id"=v_host
      and offer."status" in ('sandbox','active')
      and (offer."starts_at" is null or offer."starts_at"<=timezone('utc'::text,now()))
      and (offer."ends_at" is null or offer."ends_at">timezone('utc'::text,now()))
      and public."has_exact_live_watch_party_pass_internal"(
        v_party,pass_row."buyer_id",'live_watch_party_seat_pass'
      )
    order by pass_row."buyer_id",pass_row."created_at" desc
  ) state_row;
  return v_states;
end;
$$;
revoke all on function public."list_live_watch_party_seat_states_for_host"(text)
  from public,anon,authenticated,service_role;
grant execute on function public."list_live_watch_party_seat_states_for_host"(text)
  to authenticated;

create or replace function public."enforce_live_stage_entry_before_seat_intent_internal"()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_seat_offer public."paid_live_watch_party_offers"%rowtype;
  v_access_offer public."paid_live_watch_party_offers"%rowtype;
begin
  if new."source_type"<>'live_watch_party_seat'
    or new."product_type"<>'live_watch_party_seat_pass'
    or new."status"<>'pending'
  then return new; end if;

  select offer.* into v_seat_offer
  from public."paid_live_watch_party_offers" offer
  where offer."id"=new."source_id"
    and offer."pass_type"='live_watch_party_seat_pass';
  if v_seat_offer."id" is null
    or v_seat_offer."creator_id" is distinct from new."creator_id"
    or v_seat_offer."product_id" is distinct from new."product_id"
    or v_seat_offer."provider" is distinct from new."provider"
    or v_seat_offer."provider_product_id" is distinct from new."provider_product_id"
  then raise exception 'exact_live_seat_intent_binding_invalid'; end if;

  select offer.* into v_access_offer
  from public."paid_live_watch_party_offers" offer
  where offer."party_id"=v_seat_offer."party_id"
    and offer."pass_type"='live_watch_party_access_pass'
    and offer."status" in ('sandbox','active')
    and (offer."starts_at" is null or offer."starts_at"<=timezone('utc'::text,now()))
    and (offer."ends_at" is null or offer."ends_at">timezone('utc'::text,now()));

  if v_access_offer."id" is not null
    and not public."has_exact_live_watch_party_pass_internal"(
      v_seat_offer."party_id",new."user_id",'live_watch_party_access_pass'
    )
  then raise exception 'live_stage_entry_required_before_seat_pass'; end if;
  return new;
end;
$$;
revoke all on function public."enforce_live_stage_entry_before_seat_intent_internal"()
  from public,anon,authenticated,service_role;
drop trigger if exists "enforce_live_stage_entry_before_seat_intent"
  on public."money_purchase_intents";
create trigger "enforce_live_stage_entry_before_seat_intent"
before insert or update of "user_id","product_id","product_type","provider","provider_product_id",
  "source_type","source_id","creator_id","status"
on public."money_purchase_intents"
for each row execute function public."enforce_live_stage_entry_before_seat_intent_internal"();

create or replace function public."sync_live_stage_offer_display_config_internal"()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  update public."creator_monetization_configs" config set
    "status"=case when new."status" in ('sandbox','active') then 'sandbox' else 'disabled' end,
    "updated_at"=timezone('utc'::text,now()),
    "metadata"=coalesce(config."metadata",'{}'::jsonb)||jsonb_build_object(
      'party_id',new."party_id",'offer_status',new."status",
      'display_layer_only',true,'authority_granted',false
    )
  where config."creator_id"=new."creator_id"
    and config."source_id"=new."id"
    and config."source_type"=case when new."pass_type"='live_watch_party_access_pass'
      then 'live_watch_party_access' else 'live_watch_party_seat' end
    and config."environment"='sandbox';
  return new;
end;
$$;
revoke all on function public."sync_live_stage_offer_display_config_internal"()
  from public,anon,authenticated,service_role;
drop trigger if exists "sync_live_stage_offer_display_config"
  on public."paid_live_watch_party_offers";
create trigger "sync_live_stage_offer_display_config"
after update of "status" on public."paid_live_watch_party_offers"
for each row execute function public."sync_live_stage_offer_display_config_internal"();

create or replace function public."sync_contextual_offer_display_config_internal"()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if tg_table_name='paid_watch_party_offers' then
    update public."creator_monetization_configs" config set
      "status"=case when new."status" in ('sandbox','active') then 'sandbox' else 'disabled' end,
      "updated_at"=timezone('utc'::text,now()),
      "metadata"=coalesce(config."metadata",'{}'::jsonb)||jsonb_build_object(
        'party_id',new."party_id",'offer_status',new."status",
        'display_layer_only',true,'authority_granted',false
      )
    where config."creator_id"=new."creator_id"
      and config."source_id"=new."id"
      and config."source_type"='watch_party_live'
      and config."environment"='sandbox';
  elsif tg_table_name='paid_creator_events' then
    update public."creator_monetization_configs" config set
      "status"=case when new."status" in ('sandbox','active') then 'sandbox' else 'disabled' end,
      "updated_at"=timezone('utc'::text,now()),
      "metadata"=coalesce(config."metadata",'{}'::jsonb)||jsonb_build_object(
        'creator_event_id',new."creator_event_id",'offer_status',new."status",
        'display_layer_only',true,'authority_granted',false
      )
    where config."creator_id"=new."creator_id"
      and config."source_id"=new."creator_event_id"
      and config."source_type"='event'
      and config."environment"='sandbox';
  end if;
  return new;
end;
$$;
revoke all on function public."sync_contextual_offer_display_config_internal"()
  from public,anon,authenticated,service_role;
drop trigger if exists "sync_party_room_offer_display_config"
  on public."paid_watch_party_offers";
create trigger "sync_party_room_offer_display_config"
after update of "status" on public."paid_watch_party_offers"
for each row execute function public."sync_contextual_offer_display_config_internal"();
drop trigger if exists "sync_event_offer_display_config"
  on public."paid_creator_events";
create trigger "sync_event_offer_display_config"
after update of "status" on public."paid_creator_events"
for each row execute function public."sync_contextual_offer_display_config_internal"();

create or replace function public."request_my_live_watch_party_seat"(p_party_id text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_party text:=trim(coalesce(p_party_id,''));
  v_room public."watch_party_rooms"%rowtype;
  v_pass public."paid_live_watch_party_passes"%rowtype;
  v_membership public."watch_party_room_memberships"%rowtype;
  v_now timestamptz:=timezone('utc'::text,now());
begin
  if v_user is null or not public."wave1_current_caller_authority_internal"()
    or public."is_account_access_restricted"(v_user::text)
  then raise exception 'viewer_session_authority_required'; end if;
  select room.* into v_room from public."watch_party_rooms" room
  where room."party_id"=v_party and room."room_type"='live' and coalesce(room."is_active",false);
  if v_room."party_id" is null or v_room."host_user_id"=v_user
  then raise exception 'exact_live_stage_viewer_required'; end if;
  select membership.* into v_membership from public."watch_party_room_memberships" membership
  where membership."party_id"=v_party and membership."user_id"=v_user::text
    and membership."membership_state" in ('active','reconnecting');
  if v_membership."party_id" is null or v_membership."stage_role" in ('host','speaker')
  then raise exception 'active_live_stage_viewer_membership_required'; end if;
  select pass_row.* into v_pass
  from public."paid_live_watch_party_passes" pass_row
  where pass_row."party_id"=v_party and pass_row."buyer_id"=v_user
    and pass_row."pass_type"='live_watch_party_seat_pass' and pass_row."status"='active'
  order by pass_row."created_at" desc limit 1 for update;
  if v_pass."id" is null
    or not public."has_exact_live_watch_party_pass_internal"(
      v_party,v_user,'live_watch_party_seat_pass'
    )
  then raise exception 'live_stage_seat_pass_required'; end if;
  if exists (
    select 1 from public."paid_live_watch_party_offers" offer
    where offer."party_id"=v_party and offer."pass_type"='live_watch_party_access_pass'
      and offer."status" in ('sandbox','active')
      and (offer."starts_at" is null or offer."starts_at"<=v_now)
      and (offer."ends_at" is null or offer."ends_at">v_now)
  ) and not public."has_exact_live_watch_party_pass_internal"(
    v_party,v_user,'live_watch_party_access_pass'
  ) then raise exception 'live_stage_entry_required_before_seat_request'; end if;
  if v_pass."requested_at" is not null and v_pass."approved_at" is null and v_pass."rejected_at" is null
  then return jsonb_build_object('state','requested','alreadyRequested',true,'partyId',v_party,'buyerId',v_user,'authorityGranted',false); end if;

  update public."paid_live_watch_party_passes" set
    "requested_at"=v_now,"reviewed_at"=null,"approved_at"=null,"rejected_at"=null,"updated_at"=v_now
  where "id"=v_pass."id" returning * into v_pass;
  insert into public."notifications"(
    "user_id","actor_user_id","category","notification_type","title","body","target_route",
    "target_entity_id","target_context","deep_link","source_type","source_id","status","priority"
  ) values (
    v_room."host_user_id",v_user,'creator_money_sale','live_watch_party_seat_requested',
    'Live Stage seat requested','A viewer with an active Live Stage Seat Pass requested a speaking seat. You still decide whether to approve.',
    '/watch-party/live-stage/[partyId]',v_party,
    jsonb_build_object('party_id',v_party,'buyer_id',v_user,'seat_state','requested','authority_granted',false),
    'chillywoodmobile://watch-party/live-stage/'||v_party,'live_watch_party_seat',v_pass."offer_id"::text,'pending',4
  );
  return jsonb_build_object('state','requested','alreadyRequested',false,'partyId',v_party,'buyerId',v_user,'authorityGranted',false);
end;
$$;
revoke all on function public."request_my_live_watch_party_seat"(text) from public,anon;
grant execute on function public."request_my_live_watch_party_seat"(text) to authenticated,service_role;

create or replace function public."review_live_watch_party_seat_request"(
  p_party_id text,
  p_buyer_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_host uuid:=auth.uid();
  v_party text:=trim(coalesce(p_party_id,''));
  v_decision text:=lower(trim(coalesce(p_decision,'')));
  v_room public."watch_party_rooms"%rowtype;
  v_pass public."paid_live_watch_party_passes"%rowtype;
  v_membership public."watch_party_room_memberships"%rowtype;
  v_now timestamptz:=timezone('utc'::text,now());
begin
  if v_host is null or not public."wave1_current_caller_authority_internal"()
    or public."is_account_access_restricted"(v_host::text)
  then raise exception 'host_session_authority_required'; end if;
  if v_decision<>'reject' then raise exception 'seat_review_decision_invalid'; end if;
  select room.* into v_room from public."watch_party_rooms" room
  where room."party_id"=v_party and room."room_type"='live' and coalesce(room."is_active",false)
    and room."host_user_id"=v_host;
  if v_room."party_id" is null then raise exception 'exact_live_stage_host_required'; end if;
  select membership.* into v_membership from public."watch_party_room_memberships" membership
  where membership."party_id"=v_party and membership."user_id"=p_buyer_id::text;
  if v_membership."party_id" is null or v_membership."membership_state" not in ('active','reconnecting')
    or v_membership."stage_role" in ('host','speaker')
  then raise exception 'rejectable_live_stage_viewer_required'; end if;
  select pass_row.* into v_pass
  from public."paid_live_watch_party_passes" pass_row
  where pass_row."party_id"=v_party and pass_row."buyer_id"=p_buyer_id
    and pass_row."creator_id"=v_host and pass_row."pass_type"='live_watch_party_seat_pass'
    and pass_row."status"='active'
  order by pass_row."created_at" desc limit 1 for update;
  if v_pass."id" is null
    or v_pass."requested_at" is null
    or not public."has_exact_live_watch_party_pass_internal"(
      v_party,p_buyer_id,'live_watch_party_seat_pass'
    )
  then raise exception 'active_live_stage_seat_request_required'; end if;
  update public."paid_live_watch_party_passes" set
    "requested_at"=null,"reviewed_at"=v_now,"approved_at"=null,"rejected_at"=v_now,"updated_at"=v_now
  where "id"=v_pass."id" returning * into v_pass;
  insert into public."notifications"(
    "user_id","actor_user_id","category","notification_type","title","body","target_route",
    "target_entity_id","target_context","deep_link","source_type","source_id","status","priority"
  ) values (
    p_buyer_id,v_host,'creator_money_purchase','live_watch_party_seat_rejected',
    'Live Stage seat request not approved','The host did not approve this speaking-seat request. Your Live Stage Seat Pass remains eligibility only.',
    '/watch-party/live-stage/[partyId]',v_party,
    jsonb_build_object('party_id',v_party,'seat_state','rejected','authority_granted',false),
    'chillywoodmobile://watch-party/live-stage/'||v_party,'live_watch_party_seat',v_pass."offer_id"::text,'pending',4
  );
  return jsonb_build_object('state','rejected','partyId',v_party,'buyerId',p_buyer_id,'authorityGranted',false);
end;
$$;
revoke all on function public."review_live_watch_party_seat_request"(text,uuid,text) from public,anon;
grant execute on function public."review_live_watch_party_seat_request"(text,uuid,text) to authenticated,service_role;

create or replace function public."record_watch_party_money_pass_use_internal"()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_approved_pass public."paid_live_watch_party_passes"%rowtype;
begin
  if coalesce(new."user_id",'') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return new;
  end if;
  update public."paid_watch_party_tickets" ticket set
    "used_at"=coalesce(ticket."used_at",timezone('utc'::text,now()))
  where ticket."party_id"=new."party_id" and ticket."buyer_id"=new."user_id"::uuid
    and ticket."status"='active' and ticket."refunded_at" is null and ticket."revoked_at" is null;
  update public."paid_live_watch_party_passes" pass_row set
    "meaningful_entry_at"=coalesce(pass_row."meaningful_entry_at",timezone('utc'::text,now())),
    "updated_at"=timezone('utc'::text,now())
  where pass_row."party_id"=new."party_id" and pass_row."buyer_id"=new."user_id"::uuid
    and pass_row."status"='active';
  if new."stage_role"='speaker' and new."membership_state" in ('active','reconnecting') then
    update public."paid_live_watch_party_passes" pass_row set
      "requested_at"=null,
      "reviewed_at"=coalesce(pass_row."reviewed_at",timezone('utc'::text,now())),
      "approved_at"=coalesce(pass_row."approved_at",timezone('utc'::text,now())),
      "rejected_at"=null,
      "updated_at"=timezone('utc'::text,now())
    where pass_row."party_id"=new."party_id" and pass_row."buyer_id"=new."user_id"::uuid
      and pass_row."pass_type"='live_watch_party_seat_pass' and pass_row."status"='active'
      and public."has_exact_live_watch_party_pass_internal"(
        new."party_id",new."user_id"::uuid,'live_watch_party_seat_pass'
      )
      and (pass_row."approved_at" is null or pass_row."requested_at" is not null or pass_row."rejected_at" is not null)
    returning * into v_approved_pass;
    if v_approved_pass."id" is not null then
      insert into public."notifications"(
        "user_id","actor_user_id","category","notification_type","title","body","target_route",
        "target_entity_id","target_context","deep_link","source_type","source_id","status","priority"
      ) values (
        v_approved_pass."buyer_id",null,'creator_money_purchase','live_watch_party_seat_approved',
        'Live Stage seat approved','The host approved you as a current speaker. LiveKit publish authority still comes only from the server-backed speaker membership.',
        '/watch-party/live-stage/[partyId]',new."party_id",
        jsonb_build_object('party_id',new."party_id",'seat_state','approved','authority_granted',false),
        'chillywoodmobile://watch-party/live-stage/'||new."party_id",
        'live_watch_party_seat',v_approved_pass."offer_id"::text,'pending',4
      );
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public."record_watch_party_money_pass_use_internal"()
  from public,anon,authenticated,service_role;

comment on function public."request_my_live_watch_party_seat"(text) is
  'Persists a paid Live Stage Seat Pass request only after exact Stage entry and seat eligibility. It grants no role or LiveKit authority.';
comment on function public."review_live_watch_party_seat_request"(text,uuid,text) is
  'Persists host rejection separately from speaker approval. It grants no role or LiveKit authority.';
comment on function public."list_live_watch_party_seat_states_for_host"(text) is
  'Returns exact provider/grant-backed seat eligibility and persisted review state to the current exact Live Stage host only.';
