-- Ordinary Party Room audience metadata, explicit joined-host publication, and current access gates.
-- New explicit Party Room starts only; no backfill, HLS, URL or playback grant.
create table private.party_room_discovery_publications (
  party_id text primary key references public.watch_party_rooms(party_id) on delete cascade,
  publication_id uuid not null default gen_random_uuid(),
  host_user_id uuid not null references auth.users(id) on delete cascade,
  session_generation uuid not null references auth.sessions(id) on delete cascade,
  source_type text not null check(source_type in ('platform_title','creator_video')),
  source_id text not null,
  title_id text,
  started_at timestamptz not null default now(),
  retired_at timestamptz
);
alter table private.party_room_discovery_publications enable row level security;
revoke all on private.party_room_discovery_publications from public,anon,authenticated,service_role;
-- Room creation already inserts a host membership. Only the normal join RPC
-- records this separate proof of an actual, current session entering the room.
create table private.party_room_discovery_host_joins (
  party_id text primary key references public.watch_party_rooms(party_id) on delete cascade,
  host_user_id uuid not null references auth.users(id) on delete cascade,
  session_generation uuid not null references auth.sessions(id) on delete cascade,
  source_type text not null,
  source_id text not null,
  title_id text,
  joined_at timestamptz not null default now()
);
alter table private.party_room_discovery_host_joins enable row level security;
revoke all on private.party_room_discovery_host_joins from public,anon,authenticated,service_role;

alter table public.discovery_feed_items
  drop constraint discovery_feed_items_source_type_check,
  add constraint discovery_feed_items_source_type_check check(source_type in
    ('watch_party_room','live_stage_room','creator_event','creator_video','profile_post','channel','manual_foundation','party_room')),
  drop constraint discovery_feed_items_rights_status_check,
  add constraint discovery_feed_items_rights_status_check check(rights_status in
    ('creator_owned','chillywood_original','licensed_for_public_stream','private_use_only','protected_title_block_public_spectator','unknown_block_public_spectator','metadata_only')),
  drop constraint discovery_feed_items_public_discovery_guard_check,
  add constraint discovery_feed_items_public_discovery_guard_check check(not is_publicly_discoverable or
    (visibility='public' and moderation_status='clean' and
      (rights_status in ('creator_owned','chillywood_original','licensed_for_public_stream') or
       (source_type='party_room' and item_type='watch_party' and rights_status='metadata_only'
        and metadata->>'producer'='canonical_party_room_v1' and metadata->>'destination'='party_room_join'
        and not is_spectator_enabled and not is_spectator_playback_enabled and not allow_spectator_view
        and not allow_watch_party_from_spectator and not allow_live_reaction_rooms
        and not allow_public_share and not allow_replay_watch_party))));
alter table public.circle_spectator_feed_items
  drop constraint circle_spectator_feed_items_source_type_check,
  add constraint circle_spectator_feed_items_source_type_check check(source_type in
    ('watch_party_room','live_stage_room','creator_event','manual_foundation','party_room')),
  drop constraint circle_spectator_feed_items_rights_status_check,
  add constraint circle_spectator_feed_items_rights_status_check check(rights_status in
    ('creator_owned','chillywood_original','licensed_for_public_stream','metadata_only')),
  drop constraint circle_spectator_feed_items_safe_active_check,
  add constraint circle_spectator_feed_items_safe_active_check check(status<>'active' or
    (visibility='circle' and access_type='circle' and moderation_status='clean'
     and coalesce(source_room_id,room_id,event_id,source_id,'')<>''
     and coalesce(metadata->>'raw_hls_url','')='' and coalesce(metadata->>'hls_playback_url','')=''
     and coalesce(metadata->>'livekit_token','')='' and coalesce(metadata->>'storage_path','')=''
     and coalesce(metadata->>'storage_key','')=''
     and ((rights_status in ('creator_owned','chillywood_original','licensed_for_public_stream')
       and is_spectator_enabled and allow_spectator_view
       and not requires_ticket_to_watch and not requires_subscription_to_watch and not requires_premium_to_join)
      or (source_type='party_room' and item_type='watch_party' and rights_status='metadata_only'
       and metadata->>'producer'='canonical_party_room_v1' and metadata->>'destination'='party_room_join'
       and not is_spectator_enabled and not is_spectator_playback_enabled and not allow_spectator_view
       and not allow_watch_party_from_spectator and not allow_live_reaction_rooms and not allow_replay_watch_party))));

create function private.party_room_content_metadata(r public.watch_party_rooms)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare source_type text:=coalesce(nullif(r.source_type,''),case when nullif(r.title_id,'') is not null then 'platform_title' end);
  source_id text:=coalesce(nullif(r.source_id,''),nullif(r.title_id,'')); t public.titles; v public.videos;
begin
  if r.room_type<>'title' or source_type not in ('platform_title','creator_video') or source_id is null
    then return null; end if;
  if source_type='platform_title' then
    select * into t from public.titles where id=private.discovery_notification_uuid(source_id);
    if not found or t.is_published is not true or lower(coalesce(t.status,''))<>'published'
      or (t.release_at is not null and t.release_at>now()) or (t.release_date is not null and t.release_date>now())
      or nullif(btrim(t.video_url),'') is null then return null; end if;
    return jsonb_build_object('sourceType',source_type,'sourceId',source_id,'title',left(t.title,140));
  end if;
  select * into v from public.videos where id=private.discovery_notification_uuid(source_id);
  if not found or v.visibility<>'public' or v.moderation_status not in ('clean','reported')
    or not public.media_scan_public_safe(v.scan_status) or v.quarantined_at is not null
    or not public.is_creator_video_playable_source(v.storage_path,v.storage_object_key,v.playback_url)
    or not private.social_notification_video_allowed(v.id,r.host_user_id) then return null; end if;
  return jsonb_build_object('sourceType',source_type,'sourceId',source_id,'title',left(v.title,140));
end $$;

create function private.party_room_host_authority_current(r public.watch_party_rooms)
returns boolean language sql stable security definer set search_path='' as $$
  select not public.is_account_access_restricted(r.host_user_id::text)
    and public.premium_subject_has_finite_authority_internal(r.host_user_id::text)
    and (not exists(select 1 from public.paid_watch_party_offers o where o.party_id=r.party_id
      and o.status in ('sandbox','active','paused','sold_out','blocked')) or (
      public.wave1_creator_money_subject_authorized_internal(r.host_user_id)
      and not public.revenuecat_authority_quarantined_internal(null,r.host_user_id,null)
      and exists(select 1 from public.paid_watch_party_offers o where o.party_id=r.party_id
        and o.creator_id=r.host_user_id and o.host_id=r.host_user_id and o.status in ('sandbox','active','sold_out')
        and (o.starts_at is null or o.starts_at<=now()) and (o.ends_at is null or o.ends_at>now()))));
$$;
create function private.party_room_publication_current(p_party_id text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare r public.watch_party_rooms; p private.party_room_discovery_publications; content jsonb;
begin
  select * into r from public.watch_party_rooms where party_id=p_party_id;
  if not found or r.room_type<>'title' or not r.is_active or r.discovery_visibility not in ('public','circle')
    or not private.party_room_host_authority_current(r) then return false; end if;
  content:=private.party_room_content_metadata(r);
  if content is null then return false; end if;
  select * into p from private.party_room_discovery_publications where party_id=p_party_id;
  return found and p.retired_at is null and p.host_user_id=r.host_user_id
    and p.title_id is not distinct from r.title_id and p.source_type=content->>'sourceType' and p.source_id=content->>'sourceId'
    and exists(select 1 from auth.sessions s where s.id=p.session_generation and s.user_id=p.host_user_id
      and (s.not_after is null or s.not_after>now()))
    and exists(select 1 from public.watch_party_room_memberships m where m.party_id=r.party_id
      and m.user_id=r.host_user_id::text and m.role='host' and m.membership_state='active'
      and m.left_at is null and m.last_seen_at>now()-interval '45 seconds');
end $$;

create function private.party_room_metadata_allowed(p_party_id text,p_viewer uuid,p_audience text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare r public.watch_party_rooms;
begin
  if p_viewer is null or not private.party_room_publication_current(p_party_id)
    or public.is_account_access_restricted(p_viewer::text) then return false; end if;
  select * into r from public.watch_party_rooms where party_id=p_party_id;
  return r.discovery_visibility=p_audience and not public.is_platform_owner_user(r.host_user_id::text)
    and not public.has_channel_audience_block_between(r.host_user_id::text,p_viewer::text)
    and (p_audience='public' or p_viewer=r.host_user_id
      or public.is_active_chilly_circle_member(r.host_user_id::text,p_viewer::text));
end $$;

create function public.can_read_party_room_discovery(p_item_id uuid,p_lane text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare f jsonb; r public.watch_party_rooms; p private.party_room_discovery_publications;
begin
  if p_lane='public' then
    select to_jsonb(d) into f from public.discovery_feed_items d where id=p_item_id;
    if f->>'is_publicly_discoverable' is distinct from 'true'
      or public.discovery_feed_item_blocked_for_current_user(p_item_id) then return false; end if;
  elsif p_lane='circle' then
    select to_jsonb(d) into f from public.circle_spectator_feed_items d where id=p_item_id;
    if f->>'status' is distinct from 'active' then return false; end if;
  else return false; end if;
  if f is null or f->>'source_type'<>'party_room' or f->>'item_type'<>'watch_party'
    or f->>'rights_status'<>'metadata_only' or f->>'moderation_status'<>'clean'
    or f->>'visibility'<>p_lane or f->>'live_state'<>'live' or f->>'ended_at' is not null
    or f->>'is_spectator_enabled'<>'false' or f->>'is_spectator_playback_enabled'<>'false'
    or f->'metadata'->>'producer' is distinct from 'canonical_party_room_v1'
    or f->'metadata'->>'destination' is distinct from 'party_room_join'
    or f->'metadata'->>'canonical_projection_active' is distinct from 'true'
    or f->>'source_id' is distinct from f->>'room_id'
    then return false; end if;
  select * into r from public.watch_party_rooms where party_id=f->>'room_id';
  select * into p from private.party_room_discovery_publications where party_id=r.party_id;
  return p.publication_id::text=f->'metadata'->>'publication_id' and p.host_user_id::text=f->>'host_user_id'
    and p.source_type=f->'metadata'->>'content_source_type' and p.source_id=f->'metadata'->>'content_source_id'
    and private.party_room_metadata_allowed(r.party_id,auth.uid(),p_lane);
end $$;
revoke all on function public.can_read_party_room_discovery(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.can_read_party_room_discovery(uuid,text) to authenticated;
create policy discovery_party_room_metadata_authenticated on public.discovery_feed_items for select to authenticated
  using(source_type='party_room' and public.can_read_party_room_discovery(id,'public'));
alter function public.can_read_circle_spectator_feed_item(uuid,text) rename to can_read_circle_spectator_pre_party_room;
create function public.can_read_circle_spectator_feed_item(p_item_id uuid,p_viewer_user_id text default (auth.uid())::text)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
  if p_viewer_user_id is distinct from auth.uid()::text then return false; end if;
  if exists(select 1 from public.circle_spectator_feed_items where id=p_item_id and source_type='party_room')
    then return public.can_read_party_room_discovery(p_item_id,'circle'); end if;
  return public.can_read_circle_spectator_pre_party_room(p_item_id,p_viewer_user_id);
end $$;
revoke all on function public.can_read_circle_spectator_pre_party_room(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.can_read_circle_spectator_feed_item(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.can_read_circle_spectator_feed_item(uuid,text) to authenticated,service_role;
alter policy circle_spectator_feed_items_select_member_gated on public.circle_spectator_feed_items
  using(public.can_read_circle_spectator_feed_item(id,auth.uid()::text));

create function private.sync_party_room_discovery(p_party_id text)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.watch_party_rooms; p private.party_room_discovery_publications; c jsonb; meta jsonb; label text; paid boolean; projection uuid;
begin
  -- Serialize all projection changes on the source row, including callbacks.
  select * into r from public.watch_party_rooms where party_id=p_party_id for update;
  update public.discovery_feed_items set is_publicly_discoverable=false,discovery_surface='none',live_state='ended',
    ended_at=now(),moderation_status='hidden',metadata=metadata||'{"canonical_projection_active":false}',updated_at=now()
    where source_type='party_room' and source_id=p_party_id;
  update public.circle_spectator_feed_items set status='hidden',live_state='ended',ended_at=now(),
    moderation_status='hidden',metadata=metadata||'{"canonical_projection_active":false}',updated_at=now()
    where source_type='party_room' and source_id=p_party_id;
  if r.party_id is null or not private.party_room_publication_current(p_party_id) then return null; end if;
  select * into p from private.party_room_discovery_publications where party_id=p_party_id;
  c:=private.party_room_content_metadata(r); label:=coalesce(nullif(btrim(r.discovery_title),''),c->>'title','Watch-Party Live');
  meta:=jsonb_build_object('producer','canonical_party_room_v1','destination','party_room_join',
    'canonical_projection_active',true,'publication_id',p.publication_id,'room_id',r.party_id,
    'content_source_type',p.source_type,'content_source_id',p.source_id);
  paid:=exists(select 1 from public.paid_watch_party_offers o where o.party_id=r.party_id and o.status in ('sandbox','active','paused','sold_out','blocked'));
  if r.discovery_visibility='public' then
    insert into public.discovery_feed_items(item_type,source_type,source_id,owner_user_id,channel_user_id,host_user_id,room_id,
      title,subtitle,visibility,access_type,rights_status,discovery_surface,live_state,starts_at,published_at,
      is_publicly_discoverable,is_spectator_enabled,is_spectator_playback_enabled,allow_spectator_view,
      allow_watch_party_from_spectator,allow_live_reaction_rooms,allow_public_share,allow_replay_watch_party,
      requires_premium_to_join,requires_ticket_to_watch,requires_subscription_to_watch,metadata)
    values('watch_party','party_room',r.party_id,r.host_user_id::text,r.host_user_id::text,r.host_user_id::text,r.party_id,
      left(label,140),'Join the Party Room to check access','public',case when paid then 'ticketed' else 'premium_only' end,
      'metadata_only','home_profile_channel','live',p.started_at,p.started_at,true,false,false,false,false,false,false,false,true,paid,false,meta)
    on conflict(source_type,source_id) where source_id is not null do update set
      owner_user_id=excluded.owner_user_id,channel_user_id=excluded.channel_user_id,host_user_id=excluded.host_user_id,
      title=excluded.title,subtitle=excluded.subtitle,access_type=excluded.access_type,requires_ticket_to_watch=excluded.requires_ticket_to_watch,
      is_publicly_discoverable=true,discovery_surface='home_profile_channel',live_state='live',ended_at=null,
      moderation_status='clean',starts_at=excluded.starts_at,published_at=excluded.published_at,metadata=excluded.metadata,updated_at=now()
    returning id into projection;
  else
    insert into public.circle_spectator_feed_items(item_type,source_type,source_id,source_room_id,room_id,creator_user_id,channel_user_id,host_user_id,
      title,subtitle,visibility,access_type,rights_status,live_state,starts_at,published_at,
      is_spectator_enabled,is_spectator_playback_enabled,allow_spectator_view,allow_watch_party_from_spectator,
      allow_live_reaction_rooms,allow_replay_watch_party,requires_premium_to_join,requires_ticket_to_watch,requires_subscription_to_watch,metadata)
    values('watch_party','party_room',r.party_id,r.party_id,r.party_id,r.host_user_id::text,r.host_user_id::text,r.host_user_id::text,
      left(label,140),'Join the Party Room to check access','circle','circle','metadata_only','live',p.started_at,p.started_at,
      false,false,false,false,false,false,true,paid,false,meta)
    on conflict(source_type,(coalesce(source_id,'')),(coalesce(source_room_id,'')),(coalesce(event_id,''))) do update set
      creator_user_id=excluded.creator_user_id,channel_user_id=excluded.channel_user_id,host_user_id=excluded.host_user_id,
      title=excluded.title,subtitle=excluded.subtitle,requires_ticket_to_watch=excluded.requires_ticket_to_watch,
      status='active',live_state='live',ended_at=null,moderation_status='clean',starts_at=excluded.starts_at,
      published_at=excluded.published_at,metadata=excluded.metadata,updated_at=now()
    returning id into projection;
  end if;
  return projection;
end $$;

create function private.party_room_discovery_response(p_party_id text,p_projection uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('partyId',r.party_id,'sourceType',coalesce(nullif(r.source_type,''),'platform_title'),
    'sourceId',coalesce(nullif(r.source_id,''),r.title_id),'visibility',r.discovery_visibility,'title',r.discovery_title,
    'published',p_projection is not null,'startedAt',case when p.retired_at is null then p.started_at end,'projectionId',p_projection)
  from public.watch_party_rooms r left join private.party_room_discovery_publications p using(party_id) where r.party_id=p_party_id;
$$;
create function private.assert_party_room_discovery_host(p_party_id text,p_type text,p_source text,p_generation text)
returns public.watch_party_rooms language plpgsql security definer set search_path='' as $$
declare a jsonb:=public.wave1_session_authority_readback(); r public.watch_party_rooms;
begin
  if a->>'state'<>'ACTIVE' or a->>'restoreOnly'<>'false' or a->>'sessionGeneration' is distinct from p_generation
    or not public.wave1_current_caller_authority_internal() then raise exception 'party_room_current_session_required'; end if;
  select * into r from public.watch_party_rooms where party_id=upper(nullif(btrim(p_party_id),'')) for update;
  if not found or r.host_user_id is distinct from auth.uid() or r.room_type<>'title' or not r.is_active
    then raise exception 'party_room_host_required'; end if;
  if p_type not in ('platform_title','creator_video') or p_type is distinct from coalesce(nullif(r.source_type,''),'platform_title')
    or p_source is distinct from coalesce(nullif(r.source_id,''),r.title_id)
    then raise exception 'party_room_source_changed'; end if;
  return r;
end $$;
create function public.set_party_room_discovery(p_party_id text,p_visibility text,p_title text,
  p_expected_source_type text,p_expected_source_id text,p_session_generation text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.watch_party_rooms; projection uuid;
begin
  r:=private.assert_party_room_discovery_host(p_party_id,p_expected_source_type,p_expected_source_id,p_session_generation);
  if p_visibility is null or p_visibility not in ('private','circle','public') or length(p_title)>140
    then raise exception 'party_room_discovery_input_invalid'; end if;
  if p_visibility<>'private' and (private.party_room_content_metadata(r) is null
    or not private.party_room_host_authority_current(r))
    then raise exception 'party_room_source_authority_required'; end if;
  update public.watch_party_rooms set discovery_visibility=p_visibility,discovery_title=nullif(btrim(p_title),''),updated_at=now() where party_id=r.party_id;
  projection:=private.sync_party_room_discovery(r.party_id);
  return private.party_room_discovery_response(r.party_id,projection);
end $$;

create function private.party_room_notification_source(p_party_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.watch_party_rooms; p private.party_room_discovery_publications; projection uuid;
begin
  if not private.party_room_publication_current(p_party_id) then return '{"eligible":false}'; end if;
  select * into r from public.watch_party_rooms where party_id=p_party_id;
  select * into p from private.party_room_discovery_publications where party_id=p_party_id;
  if r.discovery_visibility='public' then
    select id into projection from public.discovery_feed_items where source_type='party_room' and source_id=p_party_id
      and is_publicly_discoverable and live_state='live' and ended_at is null
      and metadata->>'publication_id'=p.publication_id::text and metadata->>'canonical_projection_active'='true';
  else
    select id into projection from public.circle_spectator_feed_items where source_type='party_room' and source_id=p_party_id
      and status='active' and live_state='live' and ended_at is null
      and metadata->>'publication_id'=p.publication_id::text and metadata->>'canonical_projection_active'='true';
  end if;
  if projection is null then return '{"eligible":false}'; end if;
  return jsonb_build_object('eligible',true,'owner',r.host_user_id,'audience',r.discovery_visibility,
    'revision',p.publication_id,'target_route','/spectate/[itemId]','target_entity_id',projection,
    'title','Watch-Party Live started');
end $$;

create function private.enqueue_party_room_notification(p_party_id text)
returns void language plpgsql security definer set search_path='' as $$
declare s jsonb:=private.party_room_notification_source(p_party_id); who record; owner_id uuid; kind text;
begin
  if s->>'eligible' is distinct from 'true' then return; end if;
  owner_id:=private.discovery_notification_uuid(s->>'owner');
  for who in with recipients as (
    select f.follower_user_id as id from public.channel_followers f where s->>'audience'='public' and f.channel_user_id=owner_id::text
    union select case when f.user_low_id=owner_id::text then f.user_high_id else f.user_low_id end
      from public.user_friendships f where f.status='active' and owner_id::text in (f.user_low_id,f.user_high_id)
  ) select u.id,public.is_active_chilly_circle_member(owner_id::text,u.id::text) as friend
    from recipients c join auth.users u on u.id=private.discovery_notification_uuid(c.id)
    where u.id<>owner_id and private.party_room_metadata_allowed(p_party_id,u.id,s->>'audience')
  loop
    kind:=case when who.friend then 'circle_friend_live' else 'followed_creator_live' end;
    perform private.enqueue_notification_activity('discovery:party_room:'||p_party_id||':'||(s->>'revision')||':'||who.id,
      kind,p_party_id,owner_id,who.id,jsonb_build_object('sourceType','party_room','revision',s->>'revision','audience',s->>'audience'),
      now(),now()+interval '10 minutes');
  end loop;
end $$;

alter function private.resolve_discovery_notification_activity(public.notification_activity_events)
  rename to resolve_discovery_notification_pre_party_room;
create function private.resolve_discovery_notification_activity(p_event public.notification_activity_events)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s jsonb; friend boolean;
begin
  if p_event.context->>'sourceType' is distinct from 'party_room' then
    return private.resolve_discovery_notification_pre_party_room(p_event); end if;
  if p_event.event_kind not in ('circle_friend_live','followed_creator_live') then return '{"eligible":false}'; end if;
  s:=private.party_room_notification_source(p_event.source_id);
  if s->>'eligible' is distinct from 'true' or s->>'owner' is distinct from p_event.actor_user_id::text
    or s->>'revision' is distinct from p_event.context->>'revision' or s->>'audience' is distinct from p_event.context->>'audience'
    or not private.party_room_metadata_allowed(p_event.source_id,p_event.recipient_user_id,s->>'audience')
    then return '{"eligible":false}'; end if;
  friend:=public.is_active_chilly_circle_member(p_event.actor_user_id::text,p_event.recipient_user_id::text);
  if (p_event.event_kind='circle_friend_live' and not friend)
    or (p_event.event_kind='followed_creator_live' and (friend or s->>'audience'<>'public' or not exists(
      select 1 from public.channel_followers where channel_user_id=p_event.actor_user_id::text and follower_user_id=p_event.recipient_user_id::text)))
    then return '{"eligible":false}'; end if;
  return jsonb_build_object('eligible',true,'category','creator_went_live','notification_type',p_event.event_kind,
    'title',s->>'title','body',case when friend then 'Someone in your Chi''lly Circle started a Watch-Party Live.'
      else 'A creator you follow started a Watch-Party Live.' end,
    'target_route',s->>'target_route','target_entity_id',s->>'target_entity_id','target_context','{}'::jsonb,
    'preference_key',case when friend then 'circle_friend_live_enabled' else 'followed_creator_live_enabled' end);
end $$;

create function private.reconcile_party_room_discovery()
returns trigger language plpgsql security definer set search_path='' as $$
declare party text; v_source_id text; r record;
begin
  if tg_table_name='watch_party_rooms' then
    party:=new.party_id;
    if tg_op='UPDATE' and (not new.is_active or new.room_type<>'title'
      or (new.host_user_id,new.title_id,new.source_type,new.source_id)
        is distinct from (old.host_user_id,old.title_id,old.source_type,old.source_id)) then
      update private.party_room_discovery_publications set retired_at=coalesce(retired_at,now()) where party_id=party;
      delete from private.party_room_discovery_host_joins where party_id=party;
    end if;
    perform private.sync_party_room_discovery(party);
    perform private.enqueue_party_room_notification(party);
  elsif tg_table_name in ('titles','videos') then
    v_source_id:=case when tg_op='DELETE' then old.id::text else new.id::text end;
    for r in select p.party_id from private.party_room_discovery_publications p
      where p.source_id=v_source_id and p.source_type=case when tg_table_name='titles' then 'platform_title' else 'creator_video' end
    loop
      if not exists(select 1 from public.watch_party_rooms w where w.party_id=r.party_id
        and private.party_room_content_metadata(w) is not null) then
        update private.party_room_discovery_publications set retired_at=coalesce(retired_at,now()) where party_id=r.party_id;
        delete from private.party_room_discovery_host_joins where party_id=r.party_id;
      end if;
      perform private.sync_party_room_discovery(r.party_id);
    end loop;
  elsif tg_table_name='paid_watch_party_offers' then
    party:=case when tg_op='DELETE' then old.party_id else new.party_id end;
    perform private.sync_party_room_discovery(party);
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger party_room_discovery_transition after insert or update of is_active,room_type,host_user_id,title_id,source_type,source_id,discovery_visibility,discovery_title
  on public.watch_party_rooms for each row execute function private.reconcile_party_room_discovery();
create trigger party_room_title_discovery_transition after update or delete on public.titles
  for each row execute function private.reconcile_party_room_discovery();
create trigger party_room_video_discovery_transition after update or delete on public.videos
  for each row execute function private.reconcile_party_room_discovery();
create trigger party_room_offer_discovery_transition after insert or update or delete on public.paid_watch_party_offers
  for each row execute function private.reconcile_party_room_discovery();

-- This adds an audience/content gate before the unchanged Premium/pass/session
-- authority. It never substitutes a discovery row for membership or media access.
create function private.party_room_viewer_source_allowed(r public.watch_party_rooms,p_viewer uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare c jsonb;
begin
  if r.room_type<>'title' or r.discovery_visibility='private' then return true; end if;
  if p_viewer is null or public.has_channel_audience_block_between(r.host_user_id::text,p_viewer::text)
    or ((p_viewer=r.host_user_id or not exists(select 1 from public.paid_watch_party_offers o
      where o.party_id=r.party_id and o.status in ('sandbox','active','paused','sold_out','blocked')))
      and not public.premium_subject_has_finite_authority_internal(p_viewer::text))
    or (r.discovery_visibility='circle' and p_viewer<>r.host_user_id
      and not public.is_active_chilly_circle_member(r.host_user_id::text,p_viewer::text)) then return false; end if;
  c:=private.party_room_content_metadata(r);
  if c is null then return false; end if;
  return c->>'sourceType'='platform_title'
    or private.social_notification_video_allowed(private.discovery_notification_uuid(c->>'sourceId'),p_viewer);
end $$;
alter function public.join_watch_party_room_session(text,text,text,text,boolean,boolean,boolean)
  rename to join_watch_party_room_session_pre_party_room;
create function public.join_watch_party_room_session(p_party_id text,p_display_name text default null,p_avatar_url text default null,
  p_camera_preview_url text default null,p_camera_enabled boolean default false,p_mic_enabled boolean default true,p_self_muted boolean default null)
returns setof public.watch_party_room_memberships language plpgsql security definer set search_path='' as $$
declare r public.watch_party_rooms; member public.watch_party_room_memberships;
  actor text:=nullif(auth.uid()::text,''); party text:=upper(btrim(coalesce(p_party_id,'')));
begin
  if actor is null then raise exception 'watch_party_authentication_required'; end if;
  if not public.whole_app_exact_current_session_authority_internal()
    then raise exception 'watch_party_current_session_required'; end if;
  if party='' then raise exception 'watch_party_room_identity_required'; end if;
  -- Match the established join/host-moderation order: member advisory lock,
  -- then room row. Taking the room first deadlocks concurrent host removal.
  perform pg_advisory_xact_lock(hashtextextended('watch-party-member:'||party||':'||actor,0));
  select * into r from public.watch_party_rooms where party_id=party for update;
  if not private.party_room_viewer_source_allowed(r,auth.uid()) then raise exception 'party_room_viewer_authority_required'; end if;
  for member in select * from public.join_watch_party_room_session_pre_party_room(p_party_id,p_display_name,p_avatar_url,p_camera_preview_url,
    p_camera_enabled,p_mic_enabled,p_self_muted) loop
    if pg_trigger_depth()=0 and r.room_type='title' and r.host_user_id=auth.uid() and member.role='host' and member.membership_state='active'
      and member.left_at is null and coalesce(nullif(r.source_type,''),'platform_title') in ('platform_title','creator_video')
      and coalesce(nullif(r.source_id,''),r.title_id) is not null then
      insert into private.party_room_discovery_host_joins(party_id,host_user_id,session_generation,source_type,source_id,title_id)
      values(r.party_id,r.host_user_id,(auth.jwt()->>'session_id')::uuid,coalesce(nullif(r.source_type,''),'platform_title'),coalesce(nullif(r.source_id,''),r.title_id),r.title_id)
      on conflict(party_id) do update set host_user_id=excluded.host_user_id,session_generation=excluded.session_generation,
        source_type=excluded.source_type,source_id=excluded.source_id,title_id=excluded.title_id,joined_at=now();
    end if;
    return next member;
  end loop;
end $$;
revoke all on function public.join_watch_party_room_session_pre_party_room(text,text,text,text,boolean,boolean,boolean) from public,anon,authenticated,service_role;
revoke all on function public.join_watch_party_room_session(text,text,text,text,boolean,boolean,boolean) from public,anon,authenticated,service_role;
grant execute on function public.join_watch_party_room_session(text,text,text,text,boolean,boolean,boolean) to authenticated;
alter function public.resolve_watch_party_livekit_viewer_authority(text,uuid,uuid)
  rename to resolve_watch_party_livekit_pre_party_room;
create function public.resolve_watch_party_livekit_viewer_authority(p_party_id text,p_user_id uuid,p_session_generation uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.watch_party_rooms; baseline jsonb;
begin
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
revoke all on function public.resolve_watch_party_livekit_pre_party_room(text,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.resolve_watch_party_livekit_viewer_authority(text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.resolve_watch_party_livekit_viewer_authority(text,uuid,uuid) to service_role;

revoke all on function private.party_room_content_metadata(public.watch_party_rooms),
  private.party_room_host_authority_current(public.watch_party_rooms),
  private.party_room_publication_current(text),private.party_room_metadata_allowed(text,uuid,text),
  private.sync_party_room_discovery(text),private.party_room_discovery_response(text,uuid),
  private.assert_party_room_discovery_host(text,text,text,text),private.party_room_notification_source(text),
  private.enqueue_party_room_notification(text),private.resolve_discovery_notification_pre_party_room(public.notification_activity_events),
  private.resolve_discovery_notification_activity(public.notification_activity_events),private.reconcile_party_room_discovery(),
  private.party_room_viewer_source_allowed(public.watch_party_rooms,uuid)
  from public,anon,authenticated,service_role;
create function public.publish_party_room_discovery(p_party_id text,p_expected_source_type text,p_expected_source_id text,p_session_generation text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.watch_party_rooms; c jsonb; projection uuid;
begin
  r:=private.assert_party_room_discovery_host(p_party_id,p_expected_source_type,p_expected_source_id,p_session_generation);
  c:=case when r.discovery_visibility='private' then jsonb_build_object('sourceType',p_expected_source_type,'sourceId',p_expected_source_id)
    else private.party_room_content_metadata(r) end;
  if r.discovery_visibility<>'private' and (c is null or not private.party_room_host_authority_current(r))
    then raise exception 'party_room_source_authority_required'; end if;
  if not exists(select 1 from public.watch_party_room_memberships m where m.party_id=r.party_id and m.user_id=r.host_user_id::text
    and m.role='host' and m.membership_state='active' and m.left_at is null and m.last_seen_at>now()-interval '45 seconds')
    or not exists(select 1 from private.party_room_discovery_host_joins j where j.party_id=r.party_id
      and j.host_user_id=r.host_user_id and j.session_generation::text=p_session_generation
      and j.source_type=c->>'sourceType' and j.source_id=c->>'sourceId' and j.title_id is not distinct from r.title_id)
    then raise exception 'party_room_joined_host_required'; end if;
  insert into private.party_room_discovery_publications(party_id,host_user_id,session_generation,source_type,source_id,title_id)
    values(r.party_id,r.host_user_id,p_session_generation::uuid,c->>'sourceType',c->>'sourceId',r.title_id)
    on conflict(party_id) do update set publication_id=gen_random_uuid(),host_user_id=excluded.host_user_id,
      session_generation=excluded.session_generation,source_type=excluded.source_type,source_id=excluded.source_id,title_id=excluded.title_id,started_at=now(),retired_at=null
    where party_room_discovery_publications.retired_at is not null
      or (party_room_discovery_publications.host_user_id,party_room_discovery_publications.session_generation,party_room_discovery_publications.source_type,
        party_room_discovery_publications.source_id,party_room_discovery_publications.title_id)
      is distinct from (excluded.host_user_id,excluded.session_generation,excluded.source_type,excluded.source_id,excluded.title_id);
  projection:=private.sync_party_room_discovery(r.party_id);
  perform private.enqueue_party_room_notification(r.party_id);
  return private.party_room_discovery_response(r.party_id,projection);
end $$;

revoke all on function public.set_party_room_discovery(text,text,text,text,text,text),
  public.publish_party_room_discovery(text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.set_party_room_discovery(text,text,text,text,text,text),
  public.publish_party_room_discovery(text,text,text,text) to authenticated;
