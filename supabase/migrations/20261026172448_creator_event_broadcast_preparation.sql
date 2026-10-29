-- Creator preparation is not Egress approval. It binds the canonical private
-- host room to a nonplayable broadcast draft without issuing provider calls,
-- media URLs, ticket access, operator approval or new Premium entitlements.
create table private.creator_event_broadcast_preparations (
  creator_event_id uuid primary key references public.creator_events(id),
  host_user_id uuid not null references auth.users(id),
  party_id text not null unique references public.watch_party_rooms(party_id),
  broadcast_session_id uuid not null unique references public.room_broadcast_sessions(id),
  prepared_session_id uuid not null,
  created_at timestamptz not null default now()
);
alter table private.creator_event_broadcast_preparations enable row level security;
alter table private.creator_event_broadcast_preparations force row level security;
revoke all on private.creator_event_broadcast_preparations from public,anon,authenticated,service_role;

-- The host may publish their own tracks through the existing room authority.
-- Making this source room open/discoverable would bypass event ticket entry.
create function private.guard_creator_event_broadcast_room()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from private.creator_event_broadcast_preparations p where p.party_id=old.party_id)
    and (new.party_id is distinct from old.party_id or new.host_user_id is distinct from old.host_user_id
      or new.room_type<>'live' or new.join_policy<>'locked' or new.discovery_visibility<>'private'
      or new.content_access_rule<>'premium' or new.title_id is not null
      or new.source_type is not null or new.source_id is not null)
  then raise exception 'event_broadcast_host_room_identity_required'; end if;
  return new;
end;
$$;
revoke all on function private.guard_creator_event_broadcast_room() from public,anon,authenticated,service_role;
create trigger guard_creator_event_broadcast_room before update on public.watch_party_rooms
  for each row execute function private.guard_creator_event_broadcast_room();

create function public.prepare_creator_event_broadcast(p_creator_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.creator_events; p private.creator_event_broadcast_preparations;
  r public.watch_party_rooms; b public.room_broadcast_sessions;
  actor uuid:=auth.uid(); room text; broadcast uuid; paid boolean; ready boolean;
begin
  if actor is null or auth.role()<>'authenticated' or not public.wave1_current_caller_authority_internal()
    or not public.whole_app_exact_current_session_authority_internal()
    or public.is_account_access_restricted(actor::text)
  then raise exception 'event_creator_session_required'; end if;
  select * into e from public.creator_events where id=p_creator_event_id for update;
  if e.id is null or e.host_user_id<>actor then raise exception 'event_creator_required'; end if;
  if e.status not in('draft','scheduled','live_now') or e.management_status='no_show'
  then raise exception 'event_broadcast_event_closed'; end if;
  -- This is the host's existing Live First requirement. A buyer ticket never
  -- supplies Premium or host room authority.
  if not public.premium_subject_has_finite_authority_internal(actor::text)
  then raise exception 'event_broadcast_host_premium_required'; end if;
  select * into p from private.creator_event_broadcast_preparations where creator_event_id=e.id;
  if p.creator_event_id is null then
    room:='EVENT'||upper(replace(gen_random_uuid()::text,'-',''));
    insert into public.watch_party_rooms(party_id,host_user_id,room_type,title_id,source_type,source_id,
      join_policy,content_access_rule,capture_policy,discovery_visibility,discovery_title,is_active)
    values(room,actor,'live',null,null,null,'locked','premium','host_managed','private',e.event_title,true);
    -- Existing after-insert hook establishes the exact authenticated host's
    -- membership through join_watch_party_room_session; no alternate grant.
    paid:=exists(select 1 from public.paid_creator_events o where o.creator_event_id=e.id
        and o.status in('sandbox','active','sold_out','paused','blocked'))
      or exists(select 1 from public.paid_creator_event_passes pass where pass.creator_event_id=e.id);
    insert into public.room_broadcast_sessions(source_type,source_room_id,watch_party_room_id,creator_event_id,
      host_user_id,channel_user_id,broadcast_status,egress_provider,egress_status,playback_url_status,
      rights_status,access_type,is_publicly_watchable,is_spectator_playback_enabled,requires_premium,requires_ticket,metadata)
    values('creator_event',room,room,e.id::text,actor::text,actor::text,'planned','not_connected','not_connected',
      'not_available','unknown_block_public_spectator',case when paid then 'ticketed' else 'private' end,
      false,false,false,paid,jsonb_build_object('preparation_only',true,'provider_setup_required',true)) returning id into broadcast;
    insert into private.creator_event_broadcast_preparations(creator_event_id,host_user_id,party_id,broadcast_session_id,prepared_session_id)
      values(e.id,actor,room,broadcast,(auth.jwt()->>'session_id')::uuid) returning * into p;
  end if;
  select * into r from public.watch_party_rooms where party_id=p.party_id;
  select * into b from public.room_broadcast_sessions where id=p.broadcast_session_id;
  if r.party_id is null or r.host_user_id is distinct from actor or r.room_type is distinct from 'live' or r.join_policy is distinct from 'locked'
    or r.discovery_visibility is distinct from 'private' or r.content_access_rule is distinct from 'premium'
    or b.id is null or b.creator_event_id is distinct from e.id::text or b.host_user_id is distinct from actor::text
    or b.source_room_id is distinct from r.party_id or b.watch_party_room_id is distinct from r.party_id or b.source_type is distinct from 'creator_event'
  then raise exception 'event_broadcast_source_binding_invalid'; end if;
  ready:=r.is_active and exists(select 1 from public.creator_event_broadcast_ready_internal(e.id,actor,false) source
    where source.broadcast_id=p.broadcast_session_id);
  return jsonb_build_object('creatorEventId',e.id,'hostUserId',actor,'roomId',r.party_id,
    'broadcastSessionId',p.broadcast_session_id,'state',case when not r.is_active then 'room_closed'
      when ready then 'broadcast_ready' else 'awaiting_operator_setup' end,'canStart',ready,
    'providerStarted',false,'mediaUrlReturned',false,'ticketAccessGranted',false);
end;
$$;
revoke all on function public.prepare_creator_event_broadcast(uuid) from public,anon,authenticated,service_role;
grant execute on function public.prepare_creator_event_broadcast(uuid) to authenticated;

-- Host controls are rendered inside the actual live room, where camera/mic
-- publication remains mounted. The caller supplies only a room; the event is
-- resolved from the server-owned preparation instead of route metadata.
create function public.read_creator_event_for_host_room(p_party_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();r public.watch_party_rooms;e public.creator_events;
begin
  if actor is null or auth.role()<>'authenticated' or not public.whole_app_exact_current_session_authority_internal()
    or not public.wave1_current_caller_authority_internal() or public.is_account_access_restricted(actor::text)
  then raise exception 'event_creator_session_required'; end if;
  select * into r from public.watch_party_rooms where party_id=p_party_id;
  if r.party_id is null or r.host_user_id is distinct from actor or r.room_type<>'live'
  then raise exception 'event_broadcast_host_room_required'; end if;
  select event.* into e from private.creator_event_broadcast_preparations preparation
    join public.creator_events event on event.id=preparation.creator_event_id
    where preparation.party_id=r.party_id and preparation.host_user_id=actor and event.host_user_id=actor;
  return jsonb_build_object('userId',actor,'roomId',r.party_id,'creatorEvent',case when e.id is null then null else to_jsonb(e) end);
end;
$$;
revoke all on function public.read_creator_event_for_host_room(text) from public,anon,authenticated,service_role;
grant execute on function public.read_creator_event_for_host_room(text) to authenticated;
