-- Notification plumbing only. Existing request/review/role and paid-access
-- functions remain unchanged; a notification never grants a speaking role.
create function private.seat_notification_uuid(p_value text)
returns uuid language plpgsql immutable set search_path='' as $$
begin return nullif(btrim(p_value),'')::uuid;
exception when invalid_text_representation then return null; end $$;

create function private.seat_notification_source(p_kind text,p_pass_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.paid_live_watch_party_passes; r public.watch_party_rooms;
  m public.watch_party_room_memberships; o public.paid_live_watch_party_offers;
  revision timestamptz; actor_id uuid; recipient_id uuid; state text;
begin
  if p_kind is null or p_kind not in ('live_watch_party_seat_requested','live_watch_party_seat_approved','live_watch_party_seat_rejected')
    then return '{"eligible":false}'; end if;
  select * into p from public.paid_live_watch_party_passes where id=p_pass_id;
  if not found or p.pass_type<>'live_watch_party_seat_pass' or p.status<>'active'
    or p.revoked_at is not null or p.refunded_at is not null then return '{"eligible":false}'; end if;
  select * into r from public.watch_party_rooms where party_id=p.party_id;
  if not found or r.room_type<>'live' or not r.is_active or r.host_user_id is distinct from p.creator_id
    or r.host_user_id=p.buyer_id then return '{"eligible":false}'; end if;
  select * into o from public.paid_live_watch_party_offers where id=p.offer_id;
  if not found or o.party_id<>p.party_id or o.creator_id<>p.creator_id or o.pass_type<>p.pass_type
    or not public.has_exact_live_watch_party_pass_internal(p.party_id,p.buyer_id,p.pass_type)
    then return '{"eligible":false}'; end if;
  select * into m from public.watch_party_room_memberships where party_id=p.party_id and user_id=p.buyer_id::text;
  if not found or m.membership_state not in ('active','reconnecting') or m.left_at is not null
    then return '{"eligible":false}'; end if;
  if exists(select 1 from public.paid_live_watch_party_offers access_offer where access_offer.party_id=p.party_id
    and access_offer.pass_type='live_watch_party_access_pass' and access_offer.status in ('sandbox','active')
    and (access_offer.starts_at is null or access_offer.starts_at<=now())
    and (access_offer.ends_at is null or access_offer.ends_at>now()))
    and not public.has_exact_live_watch_party_pass_internal(p.party_id,p.buyer_id,'live_watch_party_access_pass')
    then return '{"eligible":false}'; end if;
  if p_kind='live_watch_party_seat_requested' then
    if p.requested_at is null or p.approved_at is not null or p.rejected_at is not null
      or m.stage_role<>'listener' then return '{"eligible":false}'; end if;
    revision:=p.requested_at; actor_id:=p.buyer_id; recipient_id:=p.creator_id; state:='requested';
  elsif p_kind='live_watch_party_seat_approved' then
    if p.approved_at is null or p.requested_at is not null or p.rejected_at is not null
      or m.stage_role<>'speaker' or not m.can_speak then return '{"eligible":false}'; end if;
    revision:=p.approved_at; actor_id:=p.creator_id; recipient_id:=p.buyer_id; state:='approved';
  else
    if p.rejected_at is null or p.requested_at is not null or p.approved_at is not null
      or m.stage_role<>'listener' then return '{"eligible":false}'; end if;
    revision:=p.rejected_at; actor_id:=p.creator_id; recipient_id:=p.buyer_id; state:='rejected';
  end if;
  return jsonb_build_object('eligible',true,'actor',actor_id,'recipient',recipient_id,
    'partyId',p.party_id,'offerId',p.offer_id,'revision',revision,'state',state);
end $$;

create or replace function private.resolve_seat_notification_activity(p_event public.notification_activity_events)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s jsonb:=private.seat_notification_source(p_event.event_kind,private.seat_notification_uuid(p_event.source_id));
begin
  if not coalesce((s->>'eligible')::boolean,false)
    or s->>'actor' is distinct from p_event.actor_user_id::text
    or s->>'recipient' is distinct from p_event.recipient_user_id::text
    or s->>'revision' is distinct from p_event.context->>'revision'
    or s->>'offerId' is distinct from p_event.context->>'offerId'
    then return '{"eligible":false}'; end if;
  return jsonb_build_object('eligible',true,'category',case when s->>'state'='requested'
    then 'creator_money_sale' else 'creator_money_purchase' end,'notification_type',p_event.event_kind,
    'title',case s->>'state' when 'requested' then 'Live Stage seat requested' when 'approved' then 'Live Stage seat approved'
      else 'Live Stage seat request not approved' end,
    'body',case s->>'state' when 'requested' then 'A viewer requested a speaking seat. Open the Stage to review it.'
      when 'approved' then 'The host approved your current speaking seat. Open the Stage to check your current role.'
      else 'The host did not approve this speaking-seat request. Your pass remains eligibility only.' end,
    'target_route','/watch-party/live-stage/[partyId]','target_entity_id',s->>'partyId',
    'target_context','{}'::jsonb,'preference_key','seat_activity_enabled');
end $$;

create function private.route_legacy_seat_notification_to_activity()
returns trigger language plpgsql security definer set search_path='' as $$
declare p public.paid_live_watch_party_passes; s jsonb; buyer uuid;
begin
  if new.source_type is distinct from 'live_watch_party_seat'
    or new.notification_type is null or new.notification_type not in ('live_watch_party_seat_requested','live_watch_party_seat_approved','live_watch_party_seat_rejected')
    then return new; end if;
  -- Until delivery is explicitly configured, retain the existing working bell
  -- path. Source deployment alone must not silently consume these notices.
  if not exists(select 1 from public.notification_activity_worker_config where singleton and enabled)
    then return new; end if;
  -- Only the exact current state emitted by the existing authoritative paths
  -- can become work. Invalid legacy attempts cannot bypass preferences either.
  buyer:=case when new.notification_type='live_watch_party_seat_requested' then new.actor_user_id else new.user_id end;
  select * into p from public.paid_live_watch_party_passes where offer_id=private.seat_notification_uuid(new.source_id)
    and buyer_id=buyer and party_id=new.target_entity_id and status='active' and pass_type='live_watch_party_seat_pass';
  if not found then return null; end if;
  s:=private.seat_notification_source(new.notification_type,p.id);
  if not coalesce((s->>'eligible')::boolean,false) or s->>'recipient' is distinct from new.user_id::text
    or (new.actor_user_id is not null and s->>'actor' is distinct from new.actor_user_id::text)
    or (new.notification_type<>'live_watch_party_seat_approved' and new.actor_user_id is null)
    or new.target_route is distinct from '/watch-party/live-stage/[partyId]'
    or new.target_context->>'seat_state' is distinct from s->>'state'
    then return null; end if;
  perform private.enqueue_notification_activity('seat:'||p.id||':'||new.notification_type||':'||md5(s->>'revision'),
    new.notification_type,p.id::text,private.seat_notification_uuid(s->>'actor'),private.seat_notification_uuid(s->>'recipient'),
    jsonb_build_object('revision',s->>'revision','offerId',p.offer_id),now(),now()+interval '24 hours');
  return null;
end $$;

revoke all on function private.seat_notification_uuid(text),private.seat_notification_source(text,uuid),
  private.resolve_seat_notification_activity(public.notification_activity_events),
  private.route_legacy_seat_notification_to_activity() from public,anon,authenticated,service_role;

-- Default-off preserves the existing seat bell; only configured activity
-- delivery replaces it with the tested common queue and preference path.
create trigger notification_seat_to_activity_before_insert before insert on public.notifications
  for each row execute function private.route_legacy_seat_notification_to_activity();
