-- Read-only display enrichment. No notification history, entitlement or route is changed.
create function private.notification_display_label(p_value text, p_limit integer)
returns text language sql immutable set search_path='' as $$
  select nullif(btrim(left(regexp_replace(translate(coalesce(p_value,''),
    U&'\200B\200C\200D\200E\200F\202A\202B\202C\202D\202E\2066\2067\2068\2069\FEFF',''),
    '[[:cntrl:]]',' ','g'),least(greatest(p_limit,1),160))),'');
$$;
revoke all on function private.notification_display_label(text,integer) from public,anon,authenticated,service_role;

-- Private: only entry points below may supply a viewer and canonical target.
create function private.notification_target_display(p_viewer uuid,p_route text,p_target text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare owner_id uuid; subject text; creator text; handle text; v public.videos; e public.creator_events;
  r public.watch_party_rooms; x public.creator_replay_library_items; target_uuid uuid;
begin
  if p_viewer is null or public.is_account_access_restricted(p_viewer::text) then return '{}'; end if;
  if p_target ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then target_uuid:=p_target::uuid; end if;
  if p_route in ('/vip-pass/[creatorId]','/channel-subscription/[creatorId]','/channel/[userId]','/channel-studio') then
    owner_id:=target_uuid;
  elsif p_route='/event/[eventId]' then
    select * into e from public.creator_events where id=target_uuid;
    if not found or not public.can_read_creator_event(e.id,p_viewer) then return '{}'; end if;
    owner_id:=e.host_user_id; subject:=e.event_title;
  elsif p_route='/player/[id]' then
    select * into v from public.videos where id=target_uuid;
    if not found then return '{}'; end if;
    -- The normal video predicate is deliberately session-bound. Service delivery
    -- may disclose only public-safe metadata, never impersonate a buyer session.
    if auth.role()='service_role' then
      if not coalesce(private.discovery_notification_video_public(v),false)
        or public.is_creator_video_viewer_blocked(v.owner_id::text,p_viewer::text) then return '{}'; end if;
    elsif not public.can_read_creator_video_row(v.owner_id::text,v.visibility,v.moderation_status,
      v.scan_status,v.storage_path,v.storage_object_key,v.playback_url,p_viewer::text) then return '{}'; end if;
    owner_id:=v.owner_id; subject:=v.title;
  elsif p_route='/player/replay/[replayId]' then
    select * into x from public.creator_replay_library_items where id=target_uuid;
    if not found or not public.can_read_creator_replay_library_item(x.id,p_viewer::text) then return '{}'; end if;
    owner_id:=x.owner_user_id::uuid; subject:=x.title;
  elsif p_route in ('/watch-party/[partyId]','/watch-party/live-stage/[partyId]') then
    select * into r from public.watch_party_rooms where party_id=p_target;
    if not found or not public.watch_party_room_self_access_allowed_internal(r.party_id,p_viewer::text)
      or not (r.host_user_id=p_viewer or r.discovery_visibility='public'
        or exists(select 1 from public.watch_party_room_memberships m where m.party_id=r.party_id
          and m.user_id=p_viewer::text and m.membership_state in ('active','reconnecting')
          and m.last_seen_at >= now()-interval '45 seconds')) then return '{}'; end if;
    owner_id:=r.host_user_id; subject:=r.discovery_title;
  else return '{}'; end if;
  if owner_id is null or public.is_account_access_restricted(owner_id::text)
    or not exists(select 1 from auth.users where id=owner_id)
    or public.account_deletion_public_hidden_reason(owner_id::text) is not null
    or exists(select 1 from public.channel_audience_blocks b
      where (b.channel_user_id=owner_id::text and b.blocked_user_id=p_viewer::text)
         or (b.channel_user_id=p_viewer::text and b.blocked_user_id=owner_id::text)) then return '{}'; end if;
  if auth.role()='service_role' then
    if public.is_platform_owner_user(owner_id::text) or not exists(select 1 from public.user_profiles
      where user_id=owner_id::text and profile_access_visibility='public') then return '{}'; end if;
  elsif not coalesce((public.resolve_profile_visibility_access(owner_id::text,p_viewer::text)->>'allowed')::boolean,false)
    then return '{}'; end if;
  select private.notification_display_label(p.display_name,80),private.notification_display_label(p.username,60)
    into creator,handle from public.user_profiles p where p.user_id=owner_id::text;
  if creator is null then creator:=case when handle is not null then '@'||handle end;
  elsif handle is not null and lower(creator) not in (lower(handle),lower('@'||handle))
    then creator:=creator||' (@'||handle||')'; end if;
  return jsonb_build_object('creator_id',owner_id,'creator_display_name',creator,
    'subject_title',private.notification_display_label(subject,160),'target_id',p_target);
end;
$$;
revoke all on function private.notification_target_display(uuid,text,text) from public,anon,authenticated,service_role;

create function public.read_my_notification_display_context(p_notification_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare n public.notifications; c jsonb; items jsonb:='[]'; activity public.notification_activity_events; social_plan jsonb;
begin
  if auth.role() is distinct from 'authenticated' or auth.uid() is null
    or not coalesce(public.whole_app_exact_current_session_authority_internal(),false)
    then raise exception 'notification_display_current_session_required' using errcode='42501'; end if;
  if coalesce(cardinality(p_notification_ids),0)>100 then
    raise exception 'notification_display_batch_too_large' using errcode='22023'; end if;
  for n in select * from public.notifications where user_id=auth.uid()
    and id=any(p_notification_ids) and dismissed_at is null order by id
  loop
    c:='{}';
    if (n.target_route='/vip-pass/[creatorId]' and n.notification_type='vip_access_active')
      or (n.target_route='/channel-subscription/[creatorId]' and n.notification_type='channel_subscription_active')
      or (n.target_route='/channel/[userId]' and n.notification_type='tip_sent_receipt')
      or (n.target_route='/event/[eventId]' and n.notification_type in ('event_pass_active','event_pass_event_starts_soon','event_starts_soon','upcoming_event_reminder','creator_event_updated','creator_event_canceled','auction_outbid','auction_won','auction_creator_award','auction_checkout_deadline','auction_payment_deadline'))
      or (n.target_route='/player/[id]' and n.notification_type in ('paid_video_unlocked','public_upload','content_dropped'))
      or (n.target_route='/player/replay/[replayId]' and n.notification_type='replay_later')
      or (n.target_route in ('/watch-party/[partyId]','/watch-party/live-stage/[partyId]') and n.notification_type in (
        'watch_party_ticket_ready','live_watch_party_access_ready','live_watch_party_seat_eligible',
        'live_watch_party_seat_requested','live_watch_party_seat_approved','live_watch_party_seat_rejected',
        'watch_party_ticket_room_starts_soon','watch_party_starts_soon','party_room_live','followed_creator_live','circle_friend_live','creator_went_live',
        'creator_money_refunded','creator_money_revoked','auction_outbid','auction_won','auction_creator_award','auction_checkout_deadline','auction_payment_deadline'))
      or (n.target_route='/channel-studio' and n.target_entity_id=auth.uid()::text and n.notification_type in (
        'paid_video_sold','watch_party_ticket_sold','live_watch_party_access_sold','live_watch_party_seat_sold',
        'channel_subscription_started','vip_pass_sold','event_pass_sold','tip_received','creator_money_refunded','creator_money_revoked')) then
      c:=private.notification_target_display(auth.uid(),n.target_route,n.target_entity_id);
    end if;
    if n.notification_type in ('social_follow','social_follow_request','social_follow_accepted',
      'circle_request','circle_accepted','circle_added','content_shared','circle_post','profile_post_liked',
      'profile_comment','profile_reply','video_comment','video_reply','chat_message') then
      -- Only a producer-bound outbox row may identify a social actor. Re-run
      -- existing source/relationship authorization, never read message previews.
      select * into activity from public.notification_activity_events a where a.notification_id=n.id
        and a.recipient_user_id=auth.uid() and a.event_kind=n.notification_type
        and a.actor_user_id=n.actor_user_id order by a.id limit 1;
      if found then
        social_plan:=private.resolve_social_notification_activity(activity);
        if social_plan->>'eligible'='true' and social_plan->>'target_route'=n.target_route
          and social_plan->>'target_entity_id' is not distinct from n.target_entity_id then
          c:=private.notification_target_display(auth.uid(),'/channel/[userId]',activity.actor_user_id::text);
          if c->>'creator_id' is not null then
            c:=c||jsonb_build_object('target_id',n.target_entity_id,'subject_title',
              private.notification_display_label(social_plan#>>'{target_context,display_context,subject_title}',160));
          end if;
        end if;
      end if;
    end if;
    -- Stored ledger linkage is not a display label. Revalidate all purchase
    -- bindings and compare the independently derived target before using it.
    if n.target_context->>'ledger_event_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      declare receipt jsonb;
      begin
        receipt:=private.notification_money_display_from_ledger((n.target_context->>'ledger_event_id')::uuid,auth.uid(),n.notification_type);
        if receipt->>'target_id'=n.target_entity_id and receipt->>'target_route'=n.target_route then c:=receipt; end if;
      end;
    end if;
    items:=items||jsonb_build_array(jsonb_build_object('notificationId',n.id,'notificationType',n.notification_type,
      'targetRoute',n.target_route,'targetId',n.target_entity_id,'creatorId',c->>'creator_id',
      'creatorName',c->>'creator_display_name','targetTitle',c->>'subject_title',
      'resolution',case when c->>'creator_display_name' is not null or c->>'subject_title' is not null then 'resolved' else 'unavailable' end));
  end loop;
  return jsonb_build_object('schemaVersion',1,'items',items);
end;
$$;
revoke all on function public.read_my_notification_display_context(uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.read_my_notification_display_context(uuid[]) to authenticated;

-- Push-only recipients need not have an inbox row. Verify the existing ledger,
-- its purchase intent and product before reading any target label instead.
create function private.notification_money_display_from_ledger(
  p_ledger_event_id uuid,p_recipient_user_id uuid,p_notification_type text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare l public.money_access_ledger_events; i public.money_purchase_intents; p public.monetization_products;
  buyer_kind text; seller_kind text; route text; target text; c jsonb; seller boolean;
begin
  select * into l from public.money_access_ledger_events where id=p_ledger_event_id;
  if not found or l.provider_event_id is null or l.status not in ('verified','sandbox_only','refunded','reversed','chargeback')
    or l.creator_id is null or p_recipient_user_id not in (l.user_id,l.creator_id) then return '{}'; end if;
  select * into i from public.money_purchase_intents where id::text=l.metadata->>'purchase_intent_id';
  if not found or i.user_id is distinct from l.user_id or i.creator_id is distinct from l.creator_id
    or i.product_id is distinct from l.product_id or i.source_id is distinct from l.source_id
    or i.source_type is distinct from l.source_type or i.environment is distinct from l.environment then return '{}'; end if;
  select * into p from public.monetization_products where id=l.product_id;
  if not found or p.product_type is distinct from i.product_type or p.product_key is distinct from i.product_key then return '{}'; end if;
  case i.product_type
    when 'paid_content_access' then buyer_kind:='paid_video_unlocked';seller_kind:='paid_video_sold';route:='/player/[id]';
      select id::text into target from public.videos where id=i.source_id and owner_id=i.creator_id;
    when 'channel_subscription' then buyer_kind:='channel_subscription_active';seller_kind:='channel_subscription_started';route:='/channel-subscription/[creatorId]';target:=i.creator_id::text;
    when 'vip_pass' then buyer_kind:='vip_access_active';seller_kind:='vip_pass_sold';route:='/vip-pass/[creatorId]';target:=i.creator_id::text;
    when 'creator_tip' then buyer_kind:='tip_sent_receipt';seller_kind:='tip_received';route:='/channel/[userId]';target:=i.creator_id::text;
    when 'event_pass' then
      buyer_kind:='event_pass_active';seller_kind:='event_pass_sold';route:='/event/[eventId]';
      select creator_event_id::text into target from public.paid_creator_events where creator_event_id=i.source_id and creator_id=i.creator_id;
    when 'watch_party_live_ticket' then
      buyer_kind:='watch_party_ticket_ready';seller_kind:='watch_party_ticket_sold';route:='/watch-party/[partyId]';
      select o.party_id into target from public.paid_watch_party_offers o join public.watch_party_rooms r on r.party_id=o.party_id
        where o.id=i.source_id and o.creator_id=i.creator_id and r.host_user_id=i.creator_id;
    when 'live_watch_party_access_pass' then
      buyer_kind:='live_watch_party_access_ready';seller_kind:='live_watch_party_access_sold';route:='/watch-party/live-stage/[partyId]';
      select o.party_id into target from public.paid_live_watch_party_offers o join public.watch_party_rooms r on r.party_id=o.party_id
        where o.id=i.source_id and o.creator_id=i.creator_id and o.pass_type=i.product_type and r.host_user_id=i.creator_id;
    when 'live_watch_party_seat_pass' then
      buyer_kind:='live_watch_party_seat_eligible';seller_kind:='live_watch_party_seat_sold';route:='/watch-party/live-stage/[partyId]';
      select o.party_id into target from public.paid_live_watch_party_offers o join public.watch_party_rooms r on r.party_id=o.party_id
        where o.id=i.source_id and o.creator_id=i.creator_id and o.pass_type=i.product_type and r.host_user_id=i.creator_id;
    else return '{}';
  end case;
  if target is null then return '{}'; end if;
  if route in ('/watch-party/[partyId]','/watch-party/live-stage/[partyId]')
    and nullif(i.metadata->>'party_id','') is not null and i.metadata->>'party_id'<>target then return '{}'; end if;
  seller:=p_recipient_user_id=l.creator_id and p_notification_type=seller_kind;
  if p_notification_type in ('creator_money_refunded','creator_money_revoked') then
    if (p_notification_type='creator_money_refunded' and (l.status<>'refunded' or l.event_type<>'REFUND'))
      or (p_notification_type='creator_money_revoked' and (l.status<>'reversed' or l.event_type<>'REVOCATION')) then return '{}'; end if;
    seller:=p_recipient_user_id=l.creator_id;
  elsif l.status not in ('verified','sandbox_only')
    or l.event_type not in ('INITIAL_PURCHASE','NON_RENEWING_PURCHASE','PRODUCT_CHANGE','RENEWAL','UNCANCELLATION')
    or not ((p_recipient_user_id=l.user_id and p_notification_type=buyer_kind) or seller) then return '{}'; end if;
  c:=private.notification_target_display(p_recipient_user_id,route,target);
  -- Exact source owner is also mandatory; a mismatched catalog/offer can never
  -- attach an unrelated creator's title to this receipt.
  if c->>'creator_id' is not null and c->>'creator_id'<>l.creator_id::text then return '{}'; end if;
  if c->>'creator_id' is null then
    c:=private.notification_target_display(p_recipient_user_id,'/channel/[userId]',l.creator_id::text);
  end if;
  if c->>'creator_id' is distinct from l.creator_id::text then return '{}'; end if;
  return c||jsonb_build_object('version',1,'target_id',case when seller then l.creator_id::text else target end,
    'target_route',case when seller then '/channel-studio' else route end);
end;
$$;
revoke all on function private.notification_money_display_from_ledger(uuid,uuid,text) from public,anon,authenticated,service_role;
create function public.read_creator_money_notification_display_context(
  p_ledger_event_id uuid,p_recipient_user_id uuid,p_notification_type text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  return private.notification_money_display_from_ledger(p_ledger_event_id,p_recipient_user_id,p_notification_type);
end;
$$;
revoke all on function public.read_creator_money_notification_display_context(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.read_creator_money_notification_display_context(uuid,uuid,text) to service_role;
comment on function public.read_my_notification_display_context(uuid[]) is 'Current-session own-inbox display labels only; no historical state rewrite or current entitlement claim.';
comment on function public.read_creator_money_notification_display_context(uuid,uuid,text) is 'Service-only verified-ledger receipt labels; no notification send, entitlement mutation or money movement.';
