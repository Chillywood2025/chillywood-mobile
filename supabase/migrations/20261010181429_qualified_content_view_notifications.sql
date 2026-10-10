-- Qualified video/live notification summaries only. No provider, money or access writes.
create table public.notification_video_view_sessions (
  id uuid primary key default gen_random_uuid(),
  viewer_user_id uuid not null references auth.users(id) on delete cascade,
  session_generation uuid not null references auth.sessions(id) on delete cascade,
  video_id uuid references public.videos(id) on delete cascade,
  spectator_record_id uuid references public.spectator_hls_playback_records(id) on delete cascade,
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  view_day date not null default (now() at time zone 'UTC')::date,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(viewer_user_id,video_id,view_day),
  unique(viewer_user_id,spectator_record_id,view_day),
  check ((video_id is null)<>(spectator_record_id is null)),
  check(viewer_user_id<>creator_user_id)
);
create index notification_view_session_generation_idx on public.notification_video_view_sessions(session_generation);
create index notification_view_session_video_idx on public.notification_video_view_sessions(video_id);
create index notification_view_session_spectator_idx on public.notification_video_view_sessions(spectator_record_id);
create index notification_view_session_creator_idx on public.notification_video_view_sessions(creator_user_id);
create table public.notification_qualified_views (
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  viewer_user_id uuid not null references auth.users(id) on delete cascade,
  view_kind text not null check(view_kind in ('video','live')),
  source_id text not null,
  view_day date not null default (now() at time zone 'UTC')::date,
  qualified_at timestamptz not null default now(),
  primary key(creator_user_id,viewer_user_id,view_kind,source_id,view_day),
  check(creator_user_id<>viewer_user_id)
);
create index notification_qualified_viewer_idx on public.notification_qualified_views(viewer_user_id);
alter table public.notification_video_view_sessions enable row level security;
alter table public.notification_video_view_sessions force row level security;
alter table public.notification_qualified_views enable row level security;
alter table public.notification_qualified_views force row level security;
revoke all on public.notification_video_view_sessions,public.notification_qualified_views from public,anon,authenticated;
grant all on public.notification_video_view_sessions,public.notification_qualified_views to service_role;

create function private.record_qualified_notification_view(p_kind text,p_source_id text,p_creator uuid,p_viewer uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_day date:=(now() at time zone 'UTC')::date; v_due timestamptz;
begin
  if p_creator is null or p_viewer is null or p_creator=p_viewer
    or public.is_account_access_restricted(p_creator::text) or public.is_account_access_restricted(p_viewer::text)
    or public.has_channel_audience_block_between(p_creator::text,p_viewer::text) then return false; end if;
  insert into public.notification_qualified_views(creator_user_id,viewer_user_id,view_kind,source_id,view_day)
    values(p_creator,p_viewer,p_kind,p_source_id,v_day) on conflict do nothing;
  if not found then return true; end if;
  v_due:=((v_day+1)::timestamp at time zone 'UTC');
  perform private.enqueue_notification_activity('view-summary:'||p_creator::text||':'||p_kind||':'||v_day::text,
    p_kind||'_view_summary',v_day::text,null,p_creator,jsonb_build_object('viewDay',v_day,'viewKind',p_kind),
    v_due,v_due+interval '2 days');
  return true;
end $$;
revoke all on function private.record_qualified_notification_view(text,text,uuid,uuid) from public,anon,authenticated,service_role;

create function public.begin_video_notification_view(p_video_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_session jsonb; v_user uuid:=auth.uid(); v_generation uuid; v_owner uuid; v_id uuid; v_access jsonb;
begin
  if v_user is null then return null; end if;
  v_session:=public.wave1_session_authority_readback();
  if v_session->>'state' is distinct from 'ACTIVE' or coalesce((v_session->>'restoreOnly')::boolean,false)
    or public.is_account_access_restricted(v_user::text) then return null; end if;
  v_generation:=(v_session->>'sessionGeneration')::uuid;
  select owner_id into v_owner from public.videos where id=p_video_id;
  if not found or v_owner=v_user or public.is_account_access_restricted(v_owner::text)
    or public.has_channel_audience_block_between(v_owner::text,v_user::text) then return null; end if;
  v_access:=public.resolve_creator_content_access('creator_video',p_video_id);
  if not coalesce((v_access->>'allowed')::boolean,false) then return null; end if;
  insert into public.notification_video_view_sessions(viewer_user_id,session_generation,video_id,creator_user_id)
    values(v_user,v_generation,p_video_id,v_owner)
    on conflict(viewer_user_id,video_id,view_day) do update set
      started_at=case when notification_video_view_sessions.session_generation=excluded.session_generation
        and (notification_video_view_sessions.completed_at is not null
          or notification_video_view_sessions.started_at>=now()-interval '2 hours')
        then notification_video_view_sessions.started_at else now() end,
      session_generation=excluded.session_generation
    returning id into v_id;
  return v_id;
end $$;

create function private.spectator_notification_view_owner(p_record_id uuid,p_viewer uuid)
returns uuid language plpgsql stable security definer set search_path='' as $$
declare v_record public.spectator_hls_playback_records; v_session public.room_broadcast_sessions; v_owner text;
begin
  if p_viewer is null or p_viewer is distinct from auth.uid() then return null; end if;
  select * into v_record from public.spectator_hls_playback_records where id=p_record_id;
  if not found or v_record.playback_status<>'live' or not v_record.is_spectator_playback_enabled
    or v_record.requires_premium or v_record.requires_ticket or nullif(v_record.playlist_path,'') is null
    or v_record.rights_status not in ('creator_owned','chillywood_original','licensed_for_public_stream') then return null; end if;
  select * into v_session from public.room_broadcast_sessions where id=v_record.broadcast_session_id;
  if not found or v_session.ended_at is not null
    or v_session.broadcast_status in ('ended','failed_later','cancelled','stopping_later')
    or v_session.egress_status in ('stopped_later','failed_later')
    or not (v_session.broadcast_status='active_later' or v_session.egress_status='active_later')
    or v_record.host_user_id is distinct from v_session.host_user_id
    or coalesce(nullif(v_record.channel_user_id,''),v_record.host_user_id) is distinct from
       coalesce(nullif(v_session.channel_user_id,''),v_session.host_user_id)
    or v_record.source_room_id is distinct from coalesce(nullif(v_session.source_room_id,''),
       nullif(v_session.watch_party_room_id,''),nullif(v_session.creator_event_id,''))
    or v_record.watch_party_room_id is distinct from v_session.watch_party_room_id
    or v_record.creator_event_id is distinct from v_session.creator_event_id
    or not v_session.is_spectator_playback_enabled or v_session.requires_premium or v_session.requires_ticket
    or v_session.rights_status not in ('creator_owned','chillywood_original','licensed_for_public_stream')
    or nullif(v_session.hls_playback_url,'') is null then return null; end if;
  if v_record.visibility='public' and v_record.access_type='public_free' and v_record.is_publicly_watchable
    and v_session.access_type='public_free' and v_session.is_publicly_watchable
    and v_session.playback_url_status='public_safe_available' and v_session.metadata->>'d7f_public_safe_approved'='true'
  then null;
  elsif v_record.visibility='circle' and v_record.access_type='circle' and not v_record.is_publicly_watchable
    and v_session.access_type='circle' and not v_session.is_publicly_watchable
    and v_session.playback_url_status='circle_safe_available' and v_session.metadata->>'circle_spectator_approved'='true'
    and public.can_read_circle_spectator_playback_record(p_record_id,p_viewer::text)
  then null;
  else return null; end if;
  v_owner:=coalesce(nullif(v_record.channel_user_id,''),nullif(v_record.host_user_id,''));
  if v_owner is null or v_owner !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or v_owner=p_viewer::text or public.is_account_access_restricted(v_owner)
    or public.is_account_access_restricted(p_viewer::text)
    or public.has_channel_audience_block_between(v_owner,p_viewer::text) then return null; end if;
  -- Bind the playback to its still-current, authoritative live source.
  if v_session.source_type in ('watch_party_room','live_stage_room') then
    if not exists(select 1 from public.watch_party_rooms r
      where r.party_id=v_record.source_room_id and r.is_active
        and r.host_user_id::text=v_session.host_user_id) then return null; end if;
  elsif v_session.source_type='creator_event' then
    if not exists(select 1 from public.creator_events e
      where e.id::text=v_session.creator_event_id and e.host_user_id=v_session.host_user_id
        and e.status='live_now' and (e.ends_at is null or e.ends_at>now())) then return null; end if;
  else return null; end if;
  return v_owner::uuid;
end $$;
revoke all on function private.spectator_notification_view_owner(uuid,uuid) from public,anon,authenticated,service_role;

create function public.begin_spectator_notification_view(p_record_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_session jsonb; v_owner uuid; v_id uuid; v_generation uuid;
begin
  if auth.uid() is null then return null; end if;
  v_session:=public.wave1_session_authority_readback();
  if v_session->>'state' is distinct from 'ACTIVE' or coalesce((v_session->>'restoreOnly')::boolean,false) then return null; end if;
  v_owner:=private.spectator_notification_view_owner(p_record_id,auth.uid());
  if v_owner is null then return null; end if;
  v_generation:=(v_session->>'sessionGeneration')::uuid;
  insert into public.notification_video_view_sessions(viewer_user_id,session_generation,spectator_record_id,creator_user_id)
    values(auth.uid(),v_generation,p_record_id,v_owner)
    on conflict(viewer_user_id,spectator_record_id,view_day) do update set
      started_at=case when notification_video_view_sessions.session_generation=excluded.session_generation
        and (notification_video_view_sessions.completed_at is not null
          or notification_video_view_sessions.started_at>=now()-interval '2 hours')
        then notification_video_view_sessions.started_at else now() end,
      session_generation=excluded.session_generation
    returning id into v_id;
  return v_id;
end $$;

create function public.complete_content_notification_view(p_view_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_session jsonb; v_row public.notification_video_view_sessions; v_owner uuid; v_access jsonb;
begin
  if auth.uid() is null then return false; end if;
  v_session:=public.wave1_session_authority_readback();
  if v_session->>'state' is distinct from 'ACTIVE' or coalesce((v_session->>'restoreOnly')::boolean,false)
    then return false; end if;
  select * into v_row from public.notification_video_view_sessions where id=p_view_id and viewer_user_id=auth.uid() for update;
  if not found or v_row.session_generation::text is distinct from v_session->>'sessionGeneration'
    or v_row.started_at>now()-interval '10 seconds' or v_row.started_at<now()-interval '2 hours'
    or v_row.view_day<>(now() at time zone 'UTC')::date then return false; end if;
  if v_row.video_id is not null then
    select owner_id into v_owner from public.videos where id=v_row.video_id;
    if not found or v_owner<>v_row.creator_user_id then return false; end if;
    v_access:=public.resolve_creator_content_access('creator_video',v_row.video_id);
    if not coalesce((v_access->>'allowed')::boolean,false) then return false; end if;
    if not private.record_qualified_notification_view('video',v_row.video_id::text,v_owner,auth.uid()) then return false; end if;
  else
    v_owner:=private.spectator_notification_view_owner(v_row.spectator_record_id,auth.uid());
    if v_owner is null or v_owner<>v_row.creator_user_id then return false; end if;
    if not private.record_qualified_notification_view('live','hls:'||v_row.spectator_record_id::text,v_owner,auth.uid()) then return false; end if;
  end if;
  update public.notification_video_view_sessions set completed_at=coalesce(completed_at,now()) where id=v_row.id;
  return true;
end $$;
revoke all on function public.begin_video_notification_view(uuid),public.begin_spectator_notification_view(uuid),public.complete_content_notification_view(uuid) from public,anon,service_role;
grant execute on function public.begin_video_notification_view(uuid),public.begin_spectator_notification_view(uuid),public.complete_content_notification_view(uuid) to authenticated;

create function private.qualify_live_notification_view()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_owner uuid; v_authority jsonb; v_session uuid;
begin
  -- Only a viewer's current authenticated heartbeat qualifies; host actions,
  -- removed/reconnecting rows and mere initial membership do not count.
  if not public.whole_app_exact_current_session_authority_internal()
    or auth.uid()::text<>new.user_id or new.membership_state<>'active'
    or old.membership_state<>'active' or new.left_at is not null or old.left_at is not null
    or new.joined_at>now()-interval '10 seconds' or old.last_seen_at<now()-interval '45 seconds'
    or new.last_seen_at is not distinct from old.last_seen_at
    or new.last_seen_at<now()-interval '5 seconds' or new.last_seen_at>now()+interval '1 second'
    then return new; end if;
  select host_user_id into v_owner from public.watch_party_rooms where party_id=new.party_id and room_type='live' and is_active;
  if not found or v_owner=auth.uid() then return new; end if;
  v_session:=nullif(auth.jwt()->>'session_id','')::uuid;
  if v_session is null then return new; end if;
  v_authority:=public.resolve_watch_party_livekit_viewer_authority(new.party_id,auth.uid(),v_session);
  if coalesce((v_authority->>'allowed')::boolean,false) then
    perform private.record_qualified_notification_view('live',new.party_id,v_owner,auth.uid());
  end if;
  return new;
end $$;
revoke all on function private.qualify_live_notification_view() from public,anon,authenticated,service_role;
create trigger qualify_live_notification_view after update of last_seen_at on public.watch_party_room_memberships
  for each row execute function private.qualify_live_notification_view();

create or replace function private.resolve_view_notification_activity(p_event public.notification_activity_events)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_count integer; v_kind text; v_day date;
begin
  if p_event.event_kind not in ('video_view_summary','live_view_summary') or p_event.actor_user_id is not null then
    return '{"eligible":false}'::jsonb; end if;
  v_kind:=case when p_event.event_kind='video_view_summary' then 'video' else 'live' end;
  v_day:=(p_event.context->>'viewDay')::date;
  if v_day::text<>p_event.source_id or p_event.context->>'viewKind'<>v_kind or v_day>=(now() at time zone 'UTC')::date
    then return '{"eligible":false}'::jsonb; end if;
  select count(distinct q.viewer_user_id)::integer into v_count from public.notification_qualified_views q
    where q.creator_user_id=p_event.recipient_user_id and q.view_kind=v_kind and q.view_day=v_day
      and not public.is_account_access_restricted(q.viewer_user_id::text)
      and not public.has_channel_audience_block_between(q.creator_user_id::text,q.viewer_user_id::text)
      and ((v_kind='video' and exists(select 1 from public.videos v where v.id::text=q.source_id
        and v.owner_id=q.creator_user_id and v.quarantined_at is null and v.moderation_status in ('clean','reported')))
        or (v_kind='live' and (exists(select 1 from public.watch_party_rooms r where r.party_id=q.source_id
          and r.host_user_id=q.creator_user_id and r.room_type='live')
          or exists(select 1 from public.spectator_hls_playback_records r where 'hls:'||r.id::text=q.source_id
            and coalesce(nullif(r.channel_user_id,''),nullif(r.host_user_id,''))=q.creator_user_id::text
            and r.playback_status in ('live','ended') and r.visibility in ('public','circle')))));
  if v_count=0 then return '{"eligible":false}'::jsonb; end if;
  return jsonb_build_object('eligible',true,'category','view_summary','notification_type',p_event.event_kind,
    'title',case when v_kind='video' then 'Your video views' else 'Your live views' end,
    'body',v_count::text||case when v_count=1 then ' viewer watched your ' else ' viewers watched your ' end||
      case when v_kind='video' then 'videos on ' else 'live content on ' end||v_day::text||'.',
    'target_route','/channel-studio','target_entity_id',null,
    'target_context',jsonb_build_object('viewDay',v_day,'viewerCount',v_count,'viewKind',v_kind),
    'preference_key','view_summary_enabled');
end $$;
revoke all on function private.resolve_view_notification_activity(public.notification_activity_events) from public,anon,authenticated,service_role;
comment on table public.notification_qualified_views is
  'Private notification analytics only, never purchase, payout, access or popularity authority. Distinct authenticated viewers per source/day, aggregated per creator/day; no profile views.';
