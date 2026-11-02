-- Delivery remains canonical and current. A stale public HLS row cannot
-- override the backing room's newer Off/Circle choice.
-- This is the existing ordinary/free-room source lane, not event authority:
-- ticketed event broadcasts already fail its prior eligibility predicate.
-- Event reminders/updates keep their separate canonical event enrollment,
-- visibility and entitlement path; their locked/private transport is not Off.
alter function private.discovery_notification_source(text,text)
  rename to discovery_notification_source_pre_room_visibility;
create function private.discovery_notification_source(p_type text,p_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare source jsonb; r public.watch_party_rooms;
begin
  source:=private.discovery_notification_source_pre_room_visibility(p_type,p_id);
  if source->>'eligible' is distinct from 'true' then return source; end if;
  if p_type in ('live_stage','broadcast') then
    select * into r from public.watch_party_rooms where party_id=case when p_type='live_stage' then p_id else source->>'target_entity_id' end;
    if not found or not r.is_active or r.discovery_visibility not in ('public','circle')
      or r.discovery_visibility is distinct from source->>'audience'
      then return '{"eligible":false}'; end if;
    if p_type='live_stage' then
      if not private.live_stage_publication_current(r.party_id) then return '{"eligible":false}'; end if;
      source:=source||jsonb_build_object('revision',r.room_generation);
    end if;
  end if;
  return source;
end $$;
revoke all on function private.discovery_notification_source_pre_room_visibility(text,text),
  private.discovery_notification_source(text,text) from public,anon,authenticated,service_role;

-- The owner's explicit room opt-in is not public profile visibility. Use only
-- the current room-host display label after exact consent and audience checks;
-- never reveal a private owner profile name/handle or backfill old activity.
alter function private.resolve_discovery_notification_activity(public.notification_activity_events)
  rename to resolve_discovery_notification_pre_room_owner_consent;
create function private.resolve_discovery_notification_activity(p_event public.notification_activity_events)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare plan jsonb; r public.watch_party_rooms; label text;
begin
  plan:=private.resolve_discovery_notification_pre_room_owner_consent(p_event);
  if plan->>'eligible' is distinct from 'true' or p_event.event_kind not in ('followed_creator_live','circle_friend_live')
    or not public.is_platform_owner_user(p_event.actor_user_id::text) then return plan; end if;
  if p_event.context->>'sourceType' in ('live_stage','party_room') then
    select * into r from public.watch_party_rooms where party_id=p_event.source_id;
  elsif p_event.context->>'sourceType'='broadcast' then
    select room.* into r from public.room_broadcast_sessions b join public.watch_party_rooms room
      on room.party_id=coalesce(nullif(b.source_room_id,''),nullif(b.watch_party_room_id,''))
      where b.id=private.discovery_notification_uuid(p_event.source_id);
  end if;
  if r.party_id is null or not private.room_notification_owner_opt_in(r.party_id,p_event.actor_user_id,p_event.recipient_user_id)
    then return '{"eligible":false}'; end if;
  label:=private.room_discovery_host_label(r);
  return jsonb_set(plan||jsonb_build_object('title',label||' is live'),
    '{target_context,display_context,creator_display_name}',to_jsonb(label),true);
end $$;
revoke all on function private.resolve_discovery_notification_pre_room_owner_consent(public.notification_activity_events),
  private.resolve_discovery_notification_activity(public.notification_activity_events) from public,anon,authenticated,service_role;

-- Materialized inbox text is not an ongoing disclosure grant. The original
-- notification/outbox/audit rows remain intact, including for service review.
-- Unlike pending delivery, already materialized public starts may remain as
-- explicitly ended history; an ended row never announces a new live session.
create function private.live_notification_read_context(p_notification_id uuid,p_viewer uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare n public.notifications; e public.notification_activity_events; r public.watch_party_rooms;
  source jsonb; publication jsonb; creator jsonb; state text:='live';
begin
  if p_viewer is null or public.is_account_access_restricted(p_viewer::text) then return '{}'; end if;
  select * into n from public.notifications where id=p_notification_id and user_id=p_viewer;
  if not found or n.notification_type not in ('followed_creator_live','circle_friend_live','live_room_member_joined')
    or n.source_type is distinct from 'notification_activity' then return '{}'; end if;
  select * into e from public.notification_activity_events where id=private.discovery_notification_uuid(n.source_id)
    and notification_id=n.id and recipient_user_id=p_viewer and event_kind=n.notification_type and actor_user_id=n.actor_user_id;
  if not found or e.materialized_at is null or public.is_account_access_restricted(e.actor_user_id::text)
    or public.account_deletion_public_hidden_reason(e.actor_user_id::text) is not null
    or public.has_channel_audience_block_between(e.actor_user_id::text,p_viewer::text) then return '{}'; end if;
  if n.notification_type='live_room_member_joined' then
    select * into r from public.watch_party_rooms where party_id=e.source_id;
    select jsonb_build_array(p.publication_id,p.started_at,p.retired_at) into publication
      from (select 1) singleton left join private.party_room_discovery_publications p on p.party_id=r.party_id;
    if r.party_id is null or r.notification_join_generation::text is distinct from e.context->>'generation'
      or publication is distinct from e.context->'publication' or r.host_user_id::text is distinct from e.context->>'hostId'
      or n.target_entity_id is distinct from r.party_id
      or n.target_route is distinct from (case when r.room_type='live' then '/watch-party/live-stage/[partyId]' else '/watch-party/[partyId]' end)
      or not private.live_room_join_recipient_allowed(r,e.actor_user_id,p_viewer) then return '{}'; end if;
    return jsonb_build_object('allowed',true,'liveState','live');
  end if;
  if e.context->>'sourceType' in ('live_stage','party_room') then
    select * into r from public.watch_party_rooms where party_id=e.source_id;
  elsif e.context->>'sourceType'='broadcast' then
    select room.* into r from public.room_broadcast_sessions b join public.watch_party_rooms room
      on room.party_id=coalesce(nullif(b.source_room_id,''),nullif(b.watch_party_room_id,''))
      where b.id=private.discovery_notification_uuid(e.source_id);
  else return '{}'; end if;
  if r.party_id is null or r.host_user_id is distinct from e.actor_user_id
    or r.discovery_visibility not in ('public','circle')
    or (r.discovery_visibility='circle' and not public.is_active_chilly_circle_member(r.host_user_id::text,p_viewer::text))
    or (public.is_platform_owner_user(e.actor_user_id::text)
      and not private.room_notification_owner_opt_in(r.party_id,e.actor_user_id,p_viewer))
    or (not private.social_notification_profile_allowed(e.actor_user_id::text,p_viewer)
      and not private.room_notification_owner_opt_in(r.party_id,e.actor_user_id,p_viewer))
    or public.watch_party_room_actor_blocked_by_host(r.party_id,p_viewer::text) then return '{}'; end if;
  if r.is_active then
    source:=case when e.context->>'sourceType'='party_room' then private.party_room_notification_source(e.source_id)
      else private.discovery_notification_source(e.context->>'sourceType',e.source_id) end;
    if source->>'eligible' is distinct from 'true' or source->>'revision' is distinct from e.context->>'revision'
      or source->>'audience' is distinct from e.context->>'audience'
      or source->>'target_route' is distinct from n.target_route or source->>'target_entity_id' is distinct from n.target_entity_id
      then return '{}'; end if;
    if e.context->>'sourceType'='party_room' and not private.party_room_metadata_allowed(r.party_id,p_viewer,r.discovery_visibility)
      then return '{}'; end if;
  else
    if r.discovery_visibility<>'public' or e.context->>'audience' is distinct from 'public' then return '{}'; end if;
    state:='ended';
  end if;
  creator:=case when public.is_platform_owner_user(e.actor_user_id::text)
    then jsonb_build_object('creator_display_name',private.room_discovery_host_label(r))
    else private.notification_target_display(p_viewer,'/channel/[userId]',e.actor_user_id::text) end;
  return jsonb_build_object('allowed',true,'liveState',state,'creatorId',e.actor_user_id,
    'creatorName',creator->>'creator_display_name','targetTitle',private.notification_display_label(r.discovery_title,160));
end $$;
revoke all on function private.live_notification_read_context(uuid,uuid) from public,anon,authenticated,service_role;

create function private.live_notification_visible(p_notification_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.whole_app_exact_current_session_authority_internal()
    and coalesce((private.live_notification_read_context(p_notification_id,auth.uid())->>'allowed')::boolean,false);
$$;
revoke all on function private.live_notification_visible(uuid) from public,anon,authenticated,service_role;
grant execute on function private.live_notification_visible(uuid) to authenticated;
create policy notifications_live_current_audience on public.notifications as restrictive for select to authenticated
  using (notification_type not in ('followed_creator_live','circle_friend_live','live_room_member_joined')
    or private.live_notification_visible(id));

-- This SECURITY DEFINER read intentionally cannot inherit table RLS. Apply the
-- same predicate explicitly, keeping the bounded exact-own-row API contract.
alter function public.read_my_notification_display_context(uuid[]) rename to read_my_notification_display_context_pre_live_visibility;
create function public.read_my_notification_display_context(p_notification_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; item jsonb; context jsonb; items jsonb:='[]';
begin
  result:=public.read_my_notification_display_context_pre_live_visibility(p_notification_ids);
  for item in select value from jsonb_array_elements(result->'items') loop
    if item->>'notificationType' in ('followed_creator_live','circle_friend_live','live_room_member_joined') then
      context:=private.live_notification_read_context(private.discovery_notification_uuid(item->>'notificationId'),auth.uid());
      if context->>'allowed' is distinct from 'true' then
        item:=item||jsonb_build_object('creatorId',null,'creatorName',null,'targetTitle',null,'resolution','unavailable','liveState','unavailable');
      elsif item->>'notificationType'='live_room_member_joined' then item:=item||jsonb_build_object('liveState','live');
      else item:=item||context||jsonb_build_object('resolution','resolved'); end if;
    end if;
    items:=items||jsonb_build_array(item);
  end loop;
  return result||jsonb_build_object('items',items);
end $$;
revoke all on function public.read_my_notification_display_context_pre_live_visibility(uuid[]),
  public.read_my_notification_display_context(uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.read_my_notification_display_context(uuid[]) to authenticated;

-- The worker runs as service_role and bypasses inbox RLS. Its OS badge must
-- nevertheless count the same currently visible rows as the recipient inbox.
alter function public.reserve_notification_activity_push(uuid,uuid,uuid) rename to reserve_notification_activity_push_pre_live_visibility;
revoke all on function public.reserve_notification_activity_push_pre_live_visibility(uuid,uuid,uuid) from public,anon,authenticated,service_role;
create function public.reserve_notification_activity_push(p_event_id uuid,p_lease_token uuid,p_push_token_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; recipient uuid; badge bigint;
begin
  result:=public.reserve_notification_activity_push_pre_live_visibility(p_event_id,p_lease_token,p_push_token_id);
  if result->>'eligible' is distinct from 'true' then return result; end if;
  select recipient_user_id into recipient from public.notification_activity_events where id=p_event_id and lease_token=p_lease_token;
  select count(*) into badge from public.notifications n where n.user_id=recipient and n.read_at is null and n.dismissed_at is null
    and (n.notification_type not in ('followed_creator_live','circle_friend_live','live_room_member_joined')
      or coalesce((private.live_notification_read_context(n.id,recipient)->>'allowed')::boolean,false));
  return result||jsonb_build_object('badge',badge);
end $$;
revoke all on function public.reserve_notification_activity_push(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.reserve_notification_activity_push(uuid,uuid,uuid) to service_role;
