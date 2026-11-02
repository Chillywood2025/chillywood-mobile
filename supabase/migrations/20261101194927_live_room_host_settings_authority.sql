-- New explicit host decisions only. No historical publication, deployment or
-- provider activation. Discovery audience and entry policy remain distinct;
-- the existing Circle admission boundary is intentionally preserved.
alter table public.watch_party_rooms
  add column room_generation uuid not null default gen_random_uuid(),
  add column host_settings_revision bigint not null default 0 check(host_settings_revision>=0);

-- Owner invisibility remains the default everywhere. Only a new, explicit
-- room-specific decision can expose this room's selected title/live identity.
create table private.room_discovery_host_consents (
  party_id text primary key references public.watch_party_rooms(party_id) on delete cascade,
  room_generation uuid not null,
  settings_revision bigint not null,
  host_user_id uuid not null references auth.users(id) on delete cascade,
  session_generation uuid not null references auth.sessions(id) on delete cascade,
  audience text not null check(audience in ('public','circle')),
  consented_at timestamptz not null default now()
);
alter table private.room_discovery_host_consents enable row level security;
alter table private.room_discovery_host_consents force row level security;
revoke all on private.room_discovery_host_consents from public,anon,authenticated,service_role;
create function private.room_host_discovery_consented(r public.watch_party_rooms)
returns boolean language sql stable security definer set search_path='' as $$
  select not public.is_platform_owner_user(r.host_user_id::text) or exists(
    select 1 from private.room_discovery_host_consents c where c.party_id=r.party_id
      and c.host_user_id=r.host_user_id and c.room_generation=r.room_generation
      and c.settings_revision=r.host_settings_revision and c.audience=r.discovery_visibility
      and r.is_active and r.discovery_visibility in ('public','circle')
      and nullif(btrim(r.discovery_title),'') is not null
      and public.money_purchase_intent_session_authorized_internal(c.host_user_id,c.session_generation::text));
$$;
create function private.room_discovery_host_label(r public.watch_party_rooms)
returns text language sql stable security definer set search_path='' as $$
  select case when private.room_host_discovery_consented(r) then coalesce((
    select private.notification_subject_label(m.display_name,80) from public.watch_party_room_memberships m
      where m.party_id=r.party_id and m.user_id=r.host_user_id::text and m.role='host'
        and m.membership_state='active' and m.left_at is null and m.last_seen_at>now()-interval '45 seconds'), 'Live host') end;
$$;
revoke all on function private.room_host_discovery_consented(public.watch_party_rooms),
  private.room_discovery_host_label(public.watch_party_rooms) from public,anon,authenticated,service_role;

create table private.live_stage_discovery_publications (
  party_id text primary key references public.watch_party_rooms(party_id) on delete cascade,
  room_generation uuid not null,
  settings_revision bigint not null,
  host_user_id uuid not null references auth.users(id) on delete cascade,
  session_generation uuid not null references auth.sessions(id) on delete cascade,
  started_at timestamptz not null default now()
);
alter table private.live_stage_discovery_publications enable row level security;
alter table private.live_stage_discovery_publications force row level security;
revoke all on private.live_stage_discovery_publications from public,anon,authenticated,service_role;

alter table private.party_room_discovery_publications
  add column room_generation uuid,
  add column settings_revision bigint;
-- Existing publications are deliberately not upgraded to explicit consent.
alter function private.party_room_publication_current(text) rename to party_room_publication_pre_host_settings;
create function private.party_room_publication_current(p_party_id text)
returns boolean language sql stable security definer set search_path='' as $$
  select private.party_room_publication_pre_host_settings(p_party_id) and exists(
    select 1 from public.watch_party_rooms r join private.party_room_discovery_publications p using(party_id)
      where r.party_id=p_party_id and p.room_generation=r.room_generation
        and p.settings_revision=r.host_settings_revision);
$$;
revoke all on function private.party_room_publication_current(text),private.party_room_publication_pre_host_settings(text)
  from public,anon,authenticated,service_role;
alter function public.publish_party_room_discovery(text,text,text,text) rename to publish_party_room_discovery_pre_host_settings;
revoke all on function public.publish_party_room_discovery_pre_host_settings(text,text,text,text) from public,anon,authenticated,service_role;
create function public.publish_party_room_discovery(p_party_id text,p_expected_source_type text,p_expected_source_id text,p_session_generation text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.watch_party_rooms; projection uuid;
begin
  r:=private.assert_party_room_discovery_host(p_party_id,p_expected_source_type,p_expected_source_id,p_session_generation);
  perform public.publish_party_room_discovery_pre_host_settings(p_party_id,p_expected_source_type,p_expected_source_id,p_session_generation);
  update private.party_room_discovery_publications set room_generation=r.room_generation,settings_revision=r.host_settings_revision
    where party_id=r.party_id;
  projection:=private.sync_party_room_discovery(r.party_id);
  perform private.enqueue_party_room_notification(r.party_id);
  return private.party_room_discovery_response(r.party_id,projection);
end $$;
revoke all on function public.publish_party_room_discovery(text,text,text,text) from public,anon,authenticated,service_role;

-- SECURITY INVOKER is deliberate: direct client UPDATE is distinguished from
-- checked SECURITY DEFINER RPCs without a client-spoofable GUC bypass.
create function private.guard_watch_party_host_settings()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='INSERT' then
    new.room_generation:=gen_random_uuid(); new.host_settings_revision:=0;
    new.discovery_started_at:=null;
    return new;
  end if;
  if current_user in ('anon','authenticated') and
    (new.join_policy,new.discovery_visibility,new.discovery_title,new.room_generation,new.host_settings_revision)
      is distinct from
    (old.join_policy,old.discovery_visibility,old.discovery_title,old.room_generation,old.host_settings_revision)
  then raise exception 'room_versioned_host_settings_required'; end if;
  if (new.is_active,new.host_user_id,new.room_type,new.title_id,new.source_type,new.source_id)
     is distinct from (old.is_active,old.host_user_id,old.room_type,old.title_id,old.source_type,old.source_id) then
    new.room_generation:=gen_random_uuid();
    new.discovery_started_at:=null;
    new.host_settings_revision:=old.host_settings_revision+1;
  elsif (new.join_policy,new.discovery_visibility,new.discovery_title)
     is distinct from (old.join_policy,old.discovery_visibility,old.discovery_title) then
    new.host_settings_revision:=old.host_settings_revision+1;
  else
    new.room_generation:=old.room_generation;
    new.host_settings_revision:=old.host_settings_revision;
  end if;
  return new;
end $$;
revoke all on function private.guard_watch_party_host_settings() from public,anon,authenticated,service_role;
create trigger aaa_watch_party_host_settings before insert or update on public.watch_party_rooms
  for each row execute function private.guard_watch_party_host_settings();

create or replace function public.guard_live_stage_discovery_started_authority()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.discovery_started_at is distinct from old.discovery_started_at and new.discovery_started_at is not null
    and not (coalesce(auth.role(),'') in ('service_role','supabase_admin')
      or (coalesce(auth.role(),'')='' and session_user in ('postgres','supabase_admin')))
  then raise exception 'live_stage_discovery_start_authority_required'; end if;
  return new;
end $$;

create function private.live_stage_publication_current(p_party_id text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.watch_party_rooms r
    join private.live_stage_discovery_publications p on p.party_id=r.party_id
    where r.party_id=p_party_id and r.room_type='live' and r.is_active
      and r.discovery_visibility in ('public','circle') and r.discovery_started_at=p.started_at
      and r.room_generation=p.room_generation and r.host_settings_revision=p.settings_revision
      and r.host_user_id=p.host_user_id
      and private.room_host_discovery_consented(r)
      and not public.is_account_access_restricted(r.host_user_id::text)
      and public.premium_subject_has_finite_authority_internal(r.host_user_id::text)
      and public.money_purchase_intent_session_authorized_internal(p.host_user_id,p.session_generation::text)
      and not exists(select 1 from private.creator_event_broadcast_preparations e where e.party_id=r.party_id)
      and exists(select 1 from public.watch_party_room_memberships m where m.party_id=r.party_id
        and m.user_id=r.host_user_id::text and m.role='host' and m.membership_state='active'
        and m.left_at is null and m.last_seen_at>now()-interval '45 seconds'));
$$;
revoke all on function private.live_stage_publication_current(text) from public,anon,authenticated,service_role;

-- Read-time canonical validation closes expiry/session/heartbeat races even
-- when no source UPDATE arrives to remove an already projected card.
create function public.can_read_current_live_stage_discovery(p_party_id text,p_audience text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.watch_party_rooms r where r.party_id=p_party_id
    and private.live_stage_publication_current(r.party_id) and r.discovery_visibility=p_audience
    and private.room_host_discovery_consented(r)
    and (auth.uid() is null or (not public.is_account_access_restricted(auth.uid()::text)
      and public.whole_app_exact_current_session_authority_internal()
      and public.wave1_current_caller_authority_internal()
      and not public.has_channel_audience_block_between(r.host_user_id::text,auth.uid()::text)))
    and (p_audience='public' or (auth.uid() is not null and
      (r.host_user_id=auth.uid() or public.is_active_chilly_circle_member(r.host_user_id::text,auth.uid()::text)))));
$$;
revoke all on function public.can_read_current_live_stage_discovery(text,text) from public,anon,authenticated,service_role;
grant execute on function public.can_read_current_live_stage_discovery(text,text) to anon,authenticated,service_role;
create policy live_stage_canonical_current_public on public.discovery_feed_items as restrictive
  for select to anon,authenticated using (source_type<>'live_stage_room' or
    public.can_read_current_live_stage_discovery(source_id,'public'));
create policy live_stage_canonical_current_circle on public.circle_spectator_feed_items as restrictive
  for select to authenticated using (source_type<>'live_stage_room' or
    public.can_read_current_live_stage_discovery(source_id,'circle'));
-- The generic owner profile/channel policies are unchanged. This one policy
-- admits only the canonical current live-room projection with explicit consent.
create policy live_stage_explicit_owner_room on public.discovery_feed_items for select to authenticated using (
  source_type='live_stage_room' and source_id=room_id and owner_user_id=host_user_id and channel_user_id=host_user_id
  and metadata->>'producer'='canonical_live_stage_v1' and metadata->>'canonical_projection_active'='true'
  and metadata->>'destination'='live_stage' and is_publicly_discoverable and visibility='public'
  and moderation_status='clean' and rights_status='creator_owned' and live_state='live' and ended_at is null
  and public.is_platform_owner_user(host_user_id)
  and public.can_read_current_live_stage_discovery(source_id,'public'));

create or replace function private.party_room_metadata_allowed(p_party_id text,p_viewer uuid,p_audience text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare r public.watch_party_rooms;
begin
  if p_viewer is null or not private.party_room_publication_current(p_party_id)
    or public.is_account_access_restricted(p_viewer::text) then return false; end if;
  select * into r from public.watch_party_rooms where party_id=p_party_id;
  return r.discovery_visibility=p_audience and private.room_host_discovery_consented(r)
    and not public.has_channel_audience_block_between(r.host_user_id::text,p_viewer::text)
    and (p_audience='public' or p_viewer=r.host_user_id
      or public.is_active_chilly_circle_member(r.host_user_id::text,p_viewer::text));
end $$;
create function private.room_notification_owner_opt_in(p_party_id text,p_host uuid,p_viewer uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.watch_party_rooms r where r.party_id=p_party_id and r.host_user_id=p_host
    and public.is_platform_owner_user(p_host::text) and private.room_host_discovery_consented(r)
    and p_viewer is not null and not public.is_account_access_restricted(p_viewer::text)
    and not public.has_channel_audience_block_between(p_host::text,p_viewer::text)
    and (r.discovery_visibility='public' or (r.discovery_visibility='circle'
      and public.is_active_chilly_circle_member(p_host::text,p_viewer::text)))
    and ((r.room_type='title' and private.party_room_publication_current(r.party_id))
      or (r.room_type='live' and private.live_stage_publication_current(r.party_id))));
$$;
revoke all on function private.room_notification_owner_opt_in(text,uuid,uuid) from public,anon,authenticated,service_role;

alter function public.sync_live_stage_discovery(text) rename to sync_live_stage_discovery_pre_host_settings;
revoke all on function public.sync_live_stage_discovery_pre_host_settings(text) from public,anon,authenticated,service_role;
create function public.sync_live_stage_discovery(p_party_id text)
returns void language plpgsql security definer set search_path='' as $$
declare room_active boolean;
begin
  select is_active into room_active from public.watch_party_rooms where party_id=p_party_id for update;
  if private.live_stage_publication_current(p_party_id) then
    perform public.sync_live_stage_discovery_pre_host_settings(p_party_id);
  else
    update public.discovery_feed_items set is_publicly_discoverable=false,discovery_surface='none',
      live_state=case when room_active is not true then 'ended' else live_state end,
      ended_at=case when room_active is not true then now() else ended_at end,
      moderation_status='hidden',metadata=metadata||'{"canonical_projection_active":false}',updated_at=now()
      where source_type='live_stage_room' and source_id=p_party_id;
    update public.circle_spectator_feed_items set status='hidden',moderation_status='hidden',
      live_state=case when room_active is not true then 'ended' else live_state end,
      ended_at=case when room_active is not true then now() else ended_at end,
      metadata=metadata||'{"canonical_projection_active":false}',updated_at=now()
      where source_type='live_stage_room' and source_id=p_party_id;
  end if;
end $$;
revoke all on function public.sync_live_stage_discovery(text) from public,anon,authenticated,service_role;
grant execute on function public.sync_live_stage_discovery(text) to service_role;

-- The old callback had no generation or session binding. Fail closed until
-- the paired Edge/client cutover; never reinterpret an old callback as current.
revoke all on function public.publish_live_stage_discovery(text,uuid) from public,anon,authenticated,service_role;
create function public.publish_live_stage_discovery_current(p_party_id text,p_actor_user_id uuid,
  p_session_generation uuid,p_expected_room_generation uuid,p_expected_settings_revision bigint)
returns boolean language plpgsql security definer set search_path='' as $$
declare r public.watch_party_rooms; publication_started timestamptz;
begin
  select * into r from public.watch_party_rooms where party_id=upper(btrim(p_party_id)) for update;
  if not found or r.host_user_id is distinct from p_actor_user_id or r.room_type<>'live' or not r.is_active
    or r.discovery_visibility='private' or r.room_generation is distinct from p_expected_room_generation
    or r.host_settings_revision is distinct from p_expected_settings_revision
    or not public.money_purchase_intent_session_authorized_internal(p_actor_user_id,p_session_generation::text)
    or not public.premium_subject_has_finite_authority_internal(p_actor_user_id::text)
    or not private.room_host_discovery_consented(r)
    or exists(select 1 from private.creator_event_broadcast_preparations where party_id=r.party_id)
    or not exists(select 1 from public.watch_party_room_memberships m where m.party_id=r.party_id
      and m.user_id=p_actor_user_id::text and m.role='host' and m.membership_state='active'
      and m.left_at is null and m.last_seen_at>now()-interval '45 seconds') then return false; end if;
  -- Same lifecycle/session keeps one start identity across settings and retries.
  select started_at into publication_started from private.live_stage_discovery_publications
    where party_id=r.party_id and room_generation=r.room_generation
      and host_user_id=r.host_user_id and session_generation=p_session_generation;
  publication_started:=coalesce(publication_started,now());
  insert into private.live_stage_discovery_publications(party_id,room_generation,settings_revision,host_user_id,session_generation,started_at)
    values(r.party_id,r.room_generation,r.host_settings_revision,r.host_user_id,p_session_generation,publication_started)
    on conflict(party_id) do update set room_generation=excluded.room_generation,settings_revision=excluded.settings_revision,
      host_user_id=excluded.host_user_id,session_generation=excluded.session_generation,started_at=excluded.started_at;
  update public.watch_party_rooms set discovery_started_at=publication_started,updated_at=now() where party_id=r.party_id;
  perform public.sync_live_stage_discovery(r.party_id);
  perform private.enqueue_discovery_notification_source('live_stage',r.party_id);
  return private.live_stage_publication_current(r.party_id);
end $$;
revoke all on function public.publish_live_stage_discovery_current(text,uuid,uuid,uuid,bigint) from public,anon,authenticated,service_role;
grant execute on function public.publish_live_stage_discovery_current(text,uuid,uuid,uuid,bigint) to service_role;

create function public.set_watch_party_room_host_settings(p_party_id text,p_expected_room_generation uuid,
  p_expected_settings_revision bigint,p_session_generation text,p_join_policy text,p_discovery_visibility text,
  p_discovery_title text,p_expected_source_type text,p_expected_source_id text,p_publish boolean default false,
  p_allow_owner_discovery boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.watch_party_rooms; a jsonb; projection uuid; publication jsonb; v_source_type text; v_source_id text;
begin
  a:=public.wave1_session_authority_readback();
  if auth.uid() is null or a->>'state' is distinct from 'ACTIVE' or a->>'restoreOnly' is distinct from 'false'
    or a->>'sessionGeneration' is distinct from p_session_generation
    or not public.whole_app_exact_current_session_authority_internal()
    or not public.wave1_current_caller_authority_internal() then raise exception 'room_current_session_required'; end if;
  select * into r from public.watch_party_rooms where party_id=upper(btrim(p_party_id)) for update;
  if not found or r.host_user_id is distinct from auth.uid() or not r.is_active
    then raise exception 'room_exact_host_required'; end if;
  if exists(select 1 from private.creator_event_broadcast_preparations where party_id=r.party_id)
    then raise exception 'event_broadcast_host_room_identity_required'; end if;
  if r.room_generation is distinct from p_expected_room_generation or r.host_settings_revision is distinct from p_expected_settings_revision
    then raise exception 'room_host_settings_conflict'; end if;
  v_source_type:=case when r.room_type='title' then coalesce(nullif(r.source_type,''),'platform_title') else r.source_type end;
  v_source_id:=case when r.room_type='title' then coalesce(nullif(r.source_id,''),r.title_id) else r.source_id end;
  if p_expected_source_type is distinct from v_source_type or p_expected_source_id is distinct from v_source_id
    then raise exception 'party_room_source_changed'; end if;
  if p_join_policy is null or p_join_policy not in ('open','locked')
    or p_discovery_visibility is null or p_discovery_visibility not in ('private','circle','public')
    or length(p_discovery_title)>140 then raise exception 'room_host_settings_input_invalid'; end if;
  if p_discovery_visibility<>'private' and
    (not public.premium_subject_has_finite_authority_internal(r.host_user_id::text)
      or (r.room_type='title' and (private.party_room_content_metadata(r) is null
        or not private.party_room_host_authority_current(r))))
    then raise exception 'party_room_source_authority_required'; end if;
  if p_allow_owner_discovery is true and p_publish is true and p_discovery_visibility<>'private'
    and public.is_platform_owner_user(r.host_user_id::text) then
    if nullif(btrim(p_discovery_title),'') is null then raise exception 'room_owner_discovery_title_required'; end if;
    if p_discovery_visibility='circle' and not exists(select 1 from public.user_friendships f
      where f.status='active' and r.host_user_id::text in (f.user_low_id,f.user_high_id)
        and public.is_active_chilly_circle_member(r.host_user_id::text,
          case when f.user_low_id=r.host_user_id::text then f.user_high_id else f.user_low_id end))
      then raise exception 'room_owner_circle_unavailable'; end if;
  end if;
  update public.watch_party_rooms set join_policy=p_join_policy,discovery_visibility=p_discovery_visibility,
    discovery_title=nullif(btrim(p_discovery_title),''),updated_at=now() where party_id=r.party_id returning * into r;
  if r.discovery_visibility='private' then
    delete from private.room_discovery_host_consents where party_id=r.party_id;
  elsif p_allow_owner_discovery is true and p_publish is true and public.is_platform_owner_user(r.host_user_id::text) then
    insert into private.room_discovery_host_consents(party_id,room_generation,settings_revision,host_user_id,session_generation,audience)
      values(r.party_id,r.room_generation,r.host_settings_revision,r.host_user_id,p_session_generation::uuid,r.discovery_visibility)
      on conflict(party_id) do update set room_generation=excluded.room_generation,settings_revision=excluded.settings_revision,
        host_user_id=excluded.host_user_id,session_generation=excluded.session_generation,audience=excluded.audience,consented_at=now();
  end if;
  if r.room_type='title' then
    -- Preparation can choose an audience, but only an actual exact-session
    -- joined host can create the publication. Turning On in-room is supported.
    if p_publish is true and private.room_host_discovery_consented(r) and r.discovery_visibility<>'private'
      and exists(select 1 from private.party_room_discovery_host_joins j
        where j.party_id=r.party_id and j.host_user_id=auth.uid() and j.session_generation::text=p_session_generation
          and j.source_type=v_source_type and j.source_id=v_source_id and j.title_id is not distinct from r.title_id)
      and exists(select 1 from public.watch_party_room_memberships m where m.party_id=r.party_id and m.user_id=auth.uid()::text
        and m.role='host' and m.membership_state='active' and m.left_at is null and m.last_seen_at>now()-interval '45 seconds') then
      publication:=public.publish_party_room_discovery(r.party_id,v_source_type,v_source_id,p_session_generation);
      projection:=nullif(publication->>'projectionId','')::uuid;
    else projection:=private.sync_party_room_discovery(r.party_id); end if;
  elsif private.live_stage_publication_current(r.party_id) then
    if r.discovery_visibility='public' then
      select id into projection from public.discovery_feed_items where source_type='live_stage_room' and source_id=r.party_id and is_publicly_discoverable;
    else
      select id into projection from public.circle_spectator_feed_items where source_type='live_stage_room' and source_id=r.party_id and status='active';
    end if;
  end if;
  return jsonb_build_object('partyId',r.party_id,'roomType',r.room_type,'roomGeneration',r.room_generation,
    'settingsRevision',r.host_settings_revision,'joinPolicy',r.join_policy,'visibility',r.discovery_visibility,
    'title',r.discovery_title,'published',projection is not null,'projectionId',projection,
    'ownerDiscoveryConsent',public.is_platform_owner_user(r.host_user_id::text) and private.room_host_discovery_consented(r),
    'startedAt',case when r.room_type='title' then
      (select p.started_at from private.party_room_discovery_publications p where p.party_id=r.party_id and p.retired_at is null)
      else r.discovery_started_at end,'sourceType',v_source_type,'sourceId',v_source_id);
end $$;
revoke all on function public.set_watch_party_room_host_settings(text,uuid,bigint,text,text,text,text,text,text,boolean,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.set_watch_party_room_host_settings(text,uuid,bigint,text,text,text,text,text,text,boolean,boolean) to authenticated;
revoke all on function public.publish_party_room_discovery(text,text,text,text) from public,anon,authenticated,service_role;

-- Legacy initial title setup is tolerated only before a versioned decision.
-- Once a room has changed settings, an old unversioned client cannot override it.
alter function public.set_party_room_discovery(text,text,text,text,text,text) rename to set_party_room_discovery_pre_host_settings;
revoke all on function public.set_party_room_discovery_pre_host_settings(text,text,text,text,text,text) from public,anon,authenticated,service_role;
create function public.set_party_room_discovery(p_party_id text,p_visibility text,p_title text,
  p_expected_source_type text,p_expected_source_id text,p_session_generation text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.watch_party_rooms;
begin
  r:=private.assert_party_room_discovery_host(p_party_id,p_expected_source_type,p_expected_source_id,p_session_generation);
  if r.host_settings_revision<>0 then raise exception 'room_versioned_host_settings_required'; end if;
  return public.set_party_room_discovery_pre_host_settings(p_party_id,p_visibility,p_title,p_expected_source_type,p_expected_source_id,p_session_generation);
end $$;
revoke all on function public.set_party_room_discovery(text,text,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.set_party_room_discovery(text,text,text,text,text,text) to authenticated;

-- A known link/code is a scoped preview, not a listing, invitation, entitlement,
-- membership or media grant. Circle and prepared-event privacy remain enforced.
create function public.resolve_watch_party_room_entry(p_party_id text,p_session_generation text)
returns setof public.watch_party_rooms language plpgsql stable security definer set search_path='' as $$
declare r public.watch_party_rooms; a jsonb:=public.wave1_session_authority_readback();
begin
  if auth.uid() is null or a->>'state' is distinct from 'ACTIVE' or a->>'restoreOnly' is distinct from 'false'
    or a->>'sessionGeneration' is distinct from p_session_generation
    or not public.whole_app_exact_current_session_authority_internal()
    or not public.wave1_current_caller_authority_internal() then raise exception 'room_current_session_required'; end if;
  if length(btrim(p_party_id)) not between 1 and 128 then return; end if;
  select * into r from public.watch_party_rooms where party_id=upper(btrim(p_party_id));
  if not found then return; end if;
  if r.host_user_id=auth.uid() then return next r; return; end if;
  if not r.is_active or public.watch_party_room_actor_blocked_by_host(r.party_id,auth.uid()::text)
    or public.has_channel_audience_block_between(r.host_user_id::text,auth.uid()::text)
    or (r.discovery_visibility='circle' and not public.is_active_chilly_circle_member(r.host_user_id::text,auth.uid()::text))
    or exists(select 1 from private.creator_event_broadcast_preparations e where e.party_id=r.party_id)
    then return; end if;
  return next r;
end $$;
revoke all on function public.resolve_watch_party_room_entry(text,text) from public,anon,authenticated,service_role;
grant execute on function public.resolve_watch_party_room_entry(text,text) to authenticated;

-- A previous attendee is not continuing authority after Circle removal,
-- blocking, account/session retirement or room end. Apply this to the actual
-- membership/message/sync policies, not only the parent room metadata row.
create or replace function public.can_read_watch_party_room_authority(p_party_id text)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select
    auth.uid() is not null
    and public.whole_app_exact_current_session_authority_internal()
    and public.wave1_current_caller_authority_internal()
    and public.watch_party_room_self_access_allowed_internal(r.party_id,auth.uid()::text)
    and (r.host_user_id=auth.uid() or (
      r.is_active
      and not public.has_channel_audience_block_between(r.host_user_id::text,auth.uid()::text)
      and (r.discovery_visibility<>'circle' or public.is_active_chilly_circle_member(r.host_user_id::text,auth.uid()::text))
      and exists(select 1 from public.watch_party_room_memberships m
        where m.party_id=r.party_id and m.user_id=auth.uid()::text
          and m.membership_state in ('active','reconnecting') and m.left_at is null
          and m.last_seen_at>=now()-interval '45 seconds')
    ))
    from public.watch_party_rooms r where r.party_id=upper(btrim(coalesce(p_party_id,'')))),false);
$$;
revoke all on function public.can_read_watch_party_room_authority(text) from public,anon;
grant execute on function public.can_read_watch_party_room_authority(text) to authenticated,service_role;

create function public.can_browse_watch_party_room(p_party_id text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare r public.watch_party_rooms;
begin
  if auth.uid() is null or public.is_account_access_restricted(auth.uid()::text)
    or not public.whole_app_exact_current_session_authority_internal()
    or not public.wave1_current_caller_authority_internal() then return false; end if;
  select * into r from public.watch_party_rooms where party_id=p_party_id;
  if not found then return false; end if;
  if r.host_user_id=auth.uid() then return true; end if;
  if public.has_channel_audience_block_between(r.host_user_id::text,auth.uid()::text)
    or public.watch_party_room_actor_blocked_by_host(r.party_id,auth.uid()::text)
    or (r.discovery_visibility='circle' and not public.is_active_chilly_circle_member(r.host_user_id::text,auth.uid()::text))
    then return false; end if;
  if public.can_read_watch_party_room_authority(r.party_id) then return true; end if;
  if r.room_type='live' then return public.can_read_current_live_stage_discovery(r.party_id,r.discovery_visibility); end if;
  return r.room_type='title' and private.party_room_metadata_allowed(r.party_id,auth.uid(),r.discovery_visibility);
end $$;
revoke all on function public.can_browse_watch_party_room(text) from public,anon,authenticated,service_role;
grant execute on function public.can_browse_watch_party_room(text) to authenticated;
drop policy if exists watch_party_rooms_authenticated_select on public.watch_party_rooms;
drop policy if exists watch_party_rooms_select_policy on public.watch_party_rooms;
create policy watch_party_rooms_scoped_read on public.watch_party_rooms for select to authenticated
  using(public.can_browse_watch_party_room(party_id));

create function public.read_public_party_room_counts(p_title_ids text[] default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or public.is_account_access_restricted(auth.uid()::text)
    or not public.whole_app_exact_current_session_authority_internal()
    or not public.wave1_current_caller_authority_internal() then
    return '{"total":0,"byTitle":[]}'; end if;
  if p_title_ids is not null and (cardinality(p_title_ids)>100 or exists(select 1 from unnest(p_title_ids) id
      where id is null or id!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
    then raise exception 'party_room_count_titles_invalid'; end if;
  with current_rooms as materialized (
    select r.party_id,p.source_type,lower(p.source_id) source_id from public.watch_party_rooms r
      join private.party_room_discovery_publications p using(party_id)
    where private.party_room_metadata_allowed(r.party_id,auth.uid(),'public')
      and exists(select 1 from public.discovery_feed_items d where d.source_type='party_room' and d.source_id=r.party_id
        and public.can_read_party_room_discovery(d.id,'public'))
      and (p_title_ids is null or (p.source_type='platform_title' and lower(p.source_id)=any(p_title_ids)))
  ), titles as (select source_id,count(*) n from current_rooms where source_type='platform_title' group by source_id)
  select jsonb_build_object('total',(select count(*) from current_rooms),'byTitle',coalesce(
    (select jsonb_agg(jsonb_build_object('titleId',source_id,'count',n) order by source_id) from titles),'[]'::jsonb)) into result;
  return result;
end $$;
revoke all on function public.read_public_party_room_counts(text[]) from public,anon,authenticated,service_role;
grant execute on function public.read_public_party_room_counts(text[]) to authenticated;
