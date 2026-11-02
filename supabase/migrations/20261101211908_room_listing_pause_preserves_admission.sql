-- Listing Off is not an audience expansion. Historical rows keep their exact
-- audience and visibility behavior; only new explicit decisions set the pause.
alter table public.watch_party_rooms add column discovery_paused boolean not null default false;

-- Admission source proof is distinct from publication consent. Pausing a
-- listing must not revoke a still-current Circle member's paid/Premium access.
-- Only the actual canonical joined host establishes this proof; no backfill.
create table private.party_room_admission_sessions (
  party_id text primary key references public.watch_party_rooms(party_id) on delete cascade,
  room_generation uuid not null,
  host_user_id uuid not null references auth.users(id) on delete cascade,
  session_generation uuid not null references auth.sessions(id) on delete cascade,
  source_type text not null,
  source_id text not null,
  title_id text,
  joined_at timestamptz not null default now()
);
alter table private.party_room_admission_sessions enable row level security;
alter table private.party_room_admission_sessions force row level security;
revoke all on private.party_room_admission_sessions from public,anon,authenticated,service_role;

create function private.party_room_admission_source_current(p_party_id text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare r public.watch_party_rooms; c jsonb;
begin
  -- Preserve a pre-cutover current publication's proven source; this does not
  -- make a paused/public-marked historical row newly discoverable or admitted.
  if private.party_room_publication_current(p_party_id) then return true; end if;
  select * into r from public.watch_party_rooms where party_id=p_party_id;
  if r.party_id is null or not r.is_active or r.room_type<>'title'
    or not private.party_room_host_authority_current(r) then return false; end if;
  c:=private.party_room_content_metadata(r);
  if c is null then return false; end if;
  return exists(select 1 from private.party_room_admission_sessions s
    where s.party_id=r.party_id and s.room_generation=r.room_generation and s.host_user_id=r.host_user_id
      and s.source_type=c->>'sourceType' and s.source_id=c->>'sourceId' and s.title_id is not distinct from r.title_id
      and public.money_purchase_intent_session_authorized_internal(s.host_user_id,s.session_generation::text)
      and exists(select 1 from public.watch_party_room_memberships m where m.party_id=r.party_id
        and m.user_id=r.host_user_id::text and m.role='host' and m.membership_state='active'
        and m.left_at is null and m.last_seen_at>now()-interval '45 seconds'));
end $$;
revoke all on function private.party_room_admission_source_current(text) from public,anon,authenticated,service_role;

alter function public.join_watch_party_room_session(text,text,text,text,boolean,boolean,boolean)
  rename to join_watch_party_room_session_pre_listing_pause;
revoke all on function public.join_watch_party_room_session_pre_listing_pause(text,text,text,text,boolean,boolean,boolean)
  from public,anon,authenticated,service_role;
create function public.join_watch_party_room_session(p_party_id text,p_display_name text default null,p_avatar_url text default null,
  p_camera_preview_url text default null,p_camera_enabled boolean default false,p_mic_enabled boolean default true,p_self_muted boolean default null)
returns setof public.watch_party_room_memberships language plpgsql security definer set search_path='' as $$
declare m public.watch_party_room_memberships; r public.watch_party_rooms; c jsonb;
begin
  for m in select * from public.join_watch_party_room_session_pre_listing_pause(p_party_id,p_display_name,p_avatar_url,
    p_camera_preview_url,p_camera_enabled,p_mic_enabled,p_self_muted) loop
    select * into r from public.watch_party_rooms where party_id=m.party_id;
    if pg_trigger_depth()=0 and r.room_type='title' and r.host_user_id=auth.uid() and m.user_id=auth.uid()::text
      and m.role='host' and m.membership_state='active' and m.left_at is null
      and public.whole_app_exact_current_session_authority_internal()
      and public.wave1_current_caller_authority_internal() then
      c:=private.party_room_content_metadata(r);
      if c is not null then
        insert into private.party_room_admission_sessions(party_id,room_generation,host_user_id,session_generation,source_type,source_id,title_id)
          values(r.party_id,r.room_generation,r.host_user_id,(auth.jwt()->>'session_id')::uuid,c->>'sourceType',c->>'sourceId',r.title_id)
          on conflict(party_id) do update set room_generation=excluded.room_generation,host_user_id=excluded.host_user_id,
            session_generation=excluded.session_generation,source_type=excluded.source_type,source_id=excluded.source_id,
            title_id=excluded.title_id,joined_at=now();
      end if;
    end if;
    return next m;
  end loop;
end $$;
revoke all on function public.join_watch_party_room_session(text,text,text,text,boolean,boolean,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.join_watch_party_room_session(text,text,text,text,boolean,boolean,boolean) to authenticated;

alter function private.party_room_publication_current(text) rename to party_room_publication_pre_listing_pause;
create function private.party_room_publication_current(p_party_id text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.watch_party_rooms where party_id=p_party_id and not discovery_paused)
    and private.party_room_publication_pre_listing_pause(p_party_id);
$$;
revoke all on function private.party_room_publication_current(text),private.party_room_publication_pre_listing_pause(text)
  from public,anon,authenticated,service_role;
alter function private.live_stage_publication_current(text) rename to live_stage_publication_pre_listing_pause;
create function private.live_stage_publication_current(p_party_id text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.watch_party_rooms where party_id=p_party_id and not discovery_paused)
    and private.live_stage_publication_pre_listing_pause(p_party_id);
$$;
revoke all on function private.live_stage_publication_current(text),private.live_stage_publication_pre_listing_pause(text)
  from public,anon,authenticated,service_role;

alter function private.room_host_discovery_consented(public.watch_party_rooms) rename to room_host_discovery_consented_pre_listing_pause;
create function private.room_host_discovery_consented(r public.watch_party_rooms)
returns boolean language sql stable security definer set search_path='' as $$
  select not r.discovery_paused and private.room_host_discovery_consented_pre_listing_pause(r);
$$;
revoke all on function private.room_host_discovery_consented(public.watch_party_rooms),
  private.room_host_discovery_consented_pre_listing_pause(public.watch_party_rooms) from public,anon,authenticated,service_role;


create or replace function private.guard_watch_party_host_settings()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='INSERT' then
    new.room_generation:=gen_random_uuid(); new.host_settings_revision:=0;
    new.discovery_started_at:=null;
    return new;
  end if;
  if current_user in ('anon','authenticated') and
    (new.join_policy,new.discovery_visibility,new.discovery_title,new.discovery_paused,new.room_generation,new.host_settings_revision)
      is distinct from
    (old.join_policy,old.discovery_visibility,old.discovery_title,old.discovery_paused,old.room_generation,old.host_settings_revision)
  then raise exception 'room_versioned_host_settings_required'; end if;
  if (new.is_active,new.host_user_id,new.room_type,new.title_id,new.source_type,new.source_id)
     is distinct from (old.is_active,old.host_user_id,old.room_type,old.title_id,old.source_type,old.source_id) then
    new.room_generation:=gen_random_uuid();
    new.discovery_started_at:=null;
    new.host_settings_revision:=old.host_settings_revision+1;
  elsif (new.join_policy,new.discovery_visibility,new.discovery_title,new.discovery_paused)
     is distinct from (old.join_policy,old.discovery_visibility,old.discovery_title,old.discovery_paused) then
    new.host_settings_revision:=old.host_settings_revision+1;
  else
    new.room_generation:=old.room_generation;
    new.host_settings_revision:=old.host_settings_revision;
  end if;
  return new;
end $$;

-- Replace only the existing target-Premium resolver publication dependency.
create or replace function public.resolve_watch_party_livekit_pre_reserved_claim(p_party_id text,p_user_id uuid,p_session_generation uuid)
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
      'speakerEligible',false,'hostAuthority',false,'expiresAt',null,'reason',
      case when p_session_generation is not null
        and exists(select 1 from auth.users subject where subject.id=p_user_id and subject.deleted_at is null)
        and public.is_account_access_restricted(p_user_id::text)
        then 'viewer_session_authority_invalid' else 'viewer_authority_invalid' end);
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
      and private.party_room_admission_source_current(r.party_id)
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
  -- Restored target-bound Premium authority can make the predecessor succeed.
  -- That must not bypass the newer published Party Room membership/TTL closure,
  -- which previously ran only while correcting a predecessor false negative.
  if auth.role()='service_role' and r.room_type='title'
    and r.content_access_rule in ('premium','party_pass')
    and not coalesce((baseline->>'paidSeatRequired')::boolean,true)
    and not exists(select 1 from public.paid_watch_party_offers o where o.party_id=r.party_id
      and o.status in ('sandbox','active','paused','sold_out','blocked'))
    and r.discovery_visibility in ('public','circle')
  then
    if not private.party_room_admission_source_current(r.party_id)
      or not exists(select 1 from public.watch_party_room_memberships m
      where m.party_id=r.party_id and m.user_id=p_user_id::text
        and m.membership_state in ('active','reconnecting') and m.left_at is null
        and m.last_seen_at>=now()-interval '45 seconds')
    then
      return jsonb_build_object('allowed',false,'paidSeatRequired',false,
        'speakerEligible',false,'hostAuthority',false,'expiresAt',null,
        'reason','room_viewer_authority_required');
    end if;
    -- Exact-target enforcement has no viewer JWT/token expiry. Its existing
    -- fresh-membership contract still requires the public/Circle publication.
    if p_session_generation is null then return baseline; end if;
    return baseline||jsonb_build_object('expiresAt',least(
      (baseline->>'expiresAt')::timestamptz,now()+interval '30 seconds',
      (select s.not_after from auth.sessions s where s.id=p_session_generation and s.user_id=p_user_id),
      (select min(e.expires_at) from public.user_entitlements e
        where e.user_id in (p_user_id::text,r.host_user_id::text)
          and e.entitlement_key='premium' and e.expires_at>now())));
  end if;
  return baseline;
end $$;

alter function public.set_watch_party_room_host_settings(text,uuid,bigint,text,text,text,text,text,text,boolean,boolean)
  rename to set_watch_party_room_host_settings_pre_listing_pause;
revoke all on function public.set_watch_party_room_host_settings_pre_listing_pause(text,uuid,bigint,text,text,text,text,text,text,boolean,boolean)
  from public,anon,authenticated,service_role;
create function public.set_watch_party_room_host_settings(p_party_id text,p_expected_room_generation uuid,
  p_expected_settings_revision bigint,p_session_generation text,p_join_policy text,p_discovery_visibility text,
  p_discovery_title text,p_expected_source_type text,p_expected_source_id text,p_publish boolean default false,
  p_allow_owner_discovery boolean default false,p_discovery_paused boolean default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.watch_party_rooms; a jsonb; projection uuid; publication jsonb; v_source_type text; v_source_id text; v_visibility text; v_paused boolean;
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
  v_visibility:=p_discovery_visibility; v_paused:=coalesce(p_discovery_paused,r.discovery_paused);
  -- Legacy Off is narrowed safely instead of changing Circle admission.
  if p_discovery_visibility='private' and r.discovery_visibility in ('public','circle') then
    v_visibility:=r.discovery_visibility; v_paused:=true;
  end if;
  if p_join_policy is null or p_join_policy not in ('open','locked')
    or p_discovery_visibility is null or p_discovery_visibility not in ('private','circle','public')
    or length(p_discovery_title)>140 then raise exception 'room_host_settings_input_invalid'; end if;
  if not v_paused and v_visibility<>'private' and
    (not public.premium_subject_has_finite_authority_internal(r.host_user_id::text)
      or (r.room_type='title' and (private.party_room_content_metadata(r) is null
        or not private.party_room_host_authority_current(r))))
    then raise exception 'party_room_source_authority_required'; end if;
  if not v_paused and p_allow_owner_discovery is true and p_publish is true and v_visibility<>'private'
    and public.is_platform_owner_user(r.host_user_id::text) then
    if nullif(btrim(p_discovery_title),'') is null then raise exception 'room_owner_discovery_title_required'; end if;
    if v_visibility='circle' and not exists(select 1 from public.user_friendships f
      where f.status='active' and r.host_user_id::text in (f.user_low_id,f.user_high_id)
        and public.is_active_chilly_circle_member(r.host_user_id::text,
          case when f.user_low_id=r.host_user_id::text then f.user_high_id else f.user_low_id end))
      then raise exception 'room_owner_circle_unavailable'; end if;
  end if;
  -- A currently proven pre-cutover publication can carry its actual joined
  -- host/source proof into this new explicit settings decision. No old row is
  -- backfilled, and an expired/unpublished/other-session marker is insufficient.
  if r.room_type='title' and private.party_room_publication_current(r.party_id)
    and exists(select 1 from private.party_room_discovery_publications p where p.party_id=r.party_id
      and p.host_user_id=auth.uid() and p.session_generation::text=p_session_generation) then
    insert into private.party_room_admission_sessions(party_id,room_generation,host_user_id,session_generation,source_type,source_id,title_id)
      values(r.party_id,r.room_generation,r.host_user_id,p_session_generation::uuid,v_source_type,v_source_id,r.title_id)
      on conflict(party_id) do update set room_generation=excluded.room_generation,host_user_id=excluded.host_user_id,
        session_generation=excluded.session_generation,source_type=excluded.source_type,source_id=excluded.source_id,
        title_id=excluded.title_id,joined_at=now();
  end if;
  update public.watch_party_rooms set join_policy=p_join_policy,discovery_visibility=v_visibility,discovery_paused=v_paused,
    discovery_title=nullif(btrim(p_discovery_title),''),updated_at=now() where party_id=r.party_id returning * into r;
  if r.discovery_visibility='private' or r.discovery_paused then
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
    if p_publish is true and not r.discovery_paused and private.room_host_discovery_consented(r) and r.discovery_visibility<>'private'
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
    'settingsRevision',r.host_settings_revision,'joinPolicy',r.join_policy,'visibility',r.discovery_visibility,'discoveryPaused',r.discovery_paused,
    'title',r.discovery_title,'published',projection is not null,'projectionId',projection,
    'ownerDiscoveryConsent',public.is_platform_owner_user(r.host_user_id::text) and private.room_host_discovery_consented(r),
    'startedAt',case when r.room_type='title' then
      (select p.started_at from private.party_room_discovery_publications p where p.party_id=r.party_id and p.retired_at is null)
      else r.discovery_started_at end,'sourceType',v_source_type,'sourceId',v_source_id);
end $$;
revoke all on function public.set_watch_party_room_host_settings(text,uuid,bigint,text,text,text,text,text,text,boolean,boolean,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.set_watch_party_room_host_settings(text,uuid,bigint,text,text,text,text,text,text,boolean,boolean,boolean) to authenticated;

-- Reserved payment is not Circle membership. This outer guard applies before
-- all existing reserved-seat fast paths without mutating any paid claim.
alter function public.resolve_watch_party_livekit_viewer_authority(text,uuid,uuid)
  rename to resolve_watch_party_livekit_pre_listing_pause;
revoke all on function public.resolve_watch_party_livekit_pre_listing_pause(text,uuid,uuid) from public,anon,authenticated,service_role;
create function public.resolve_watch_party_livekit_viewer_authority(p_party_id text,p_user_id uuid,p_session_generation uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.watch_party_rooms;
begin
  select * into r from public.watch_party_rooms where party_id=p_party_id;
  if r.discovery_visibility='circle' and p_user_id is distinct from r.host_user_id
    and (p_user_id is null or not public.is_active_chilly_circle_member(r.host_user_id::text,p_user_id::text)
      or public.has_channel_audience_block_between(r.host_user_id::text,p_user_id::text)) then
    return jsonb_build_object('allowed',false,'paidSeatRequired',false,'speakerEligible',false,
      'hostAuthority',false,'expiresAt',null,'reason','circle_live_authority_required');
  end if;
  return public.resolve_watch_party_livekit_pre_listing_pause(p_party_id,p_user_id,p_session_generation);
end $$;
revoke all on function public.resolve_watch_party_livekit_viewer_authority(text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.resolve_watch_party_livekit_viewer_authority(text,uuid,uuid) to service_role;

alter function private.discovery_notification_source(text,text) rename to discovery_notification_source_pre_listing_pause;
create function private.discovery_notification_source(p_type text,p_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  result:=private.discovery_notification_source_pre_listing_pause(p_type,p_id);
  if result->>'eligible'='true' and p_type in ('live_stage','broadcast') and exists(
    select 1 from public.watch_party_rooms r where party_id=case when p_type='live_stage' then p_id else result->>'target_entity_id' end
      and discovery_paused and not exists(select 1 from private.creator_event_broadcast_preparations p where p.party_id=r.party_id))
    then return '{"eligible":false}'; end if;
  return result;
end $$;
revoke all on function private.discovery_notification_source(text,text),private.discovery_notification_source_pre_listing_pause(text,text)
  from public,anon,authenticated,service_role;

-- A paused start must not revive merely because the host later ends the room.
-- Ordinary unpaused Public ended history retains its truthful nonjoinable state.
alter function private.live_notification_read_context(uuid,uuid) rename to live_notification_read_context_pre_listing_pause;
create function private.live_notification_read_context(p_notification_id uuid,p_viewer uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if exists(select 1 from public.notifications n join public.notification_activity_events e
    on e.id=private.discovery_notification_uuid(n.source_id) and e.notification_id=n.id
    join public.watch_party_rooms r on r.party_id=case when e.context->>'sourceType'='broadcast'
      then (select coalesce(nullif(b.source_room_id,''),nullif(b.watch_party_room_id,'')) from public.room_broadcast_sessions b
        where b.id=private.discovery_notification_uuid(e.source_id)) else e.source_id end
    where n.id=p_notification_id and n.user_id=p_viewer and n.source_type='notification_activity'
      and n.notification_type in ('followed_creator_live','circle_friend_live') and r.discovery_paused
      and not exists(select 1 from private.creator_event_broadcast_preparations p where p.party_id=r.party_id))
    then return '{}'; end if;
  return private.live_notification_read_context_pre_listing_pause(p_notification_id,p_viewer);
end $$;
revoke all on function private.live_notification_read_context(uuid,uuid),private.live_notification_read_context_pre_listing_pause(uuid,uuid)
  from public,anon,authenticated,service_role;

create function private.reconcile_room_listing_pause()
returns trigger language plpgsql security definer set search_path='' as $$
declare broadcast_id uuid;
begin
  if (new.discovery_paused,new.discovery_visibility,new.is_active,new.host_user_id)
    is not distinct from (old.discovery_paused,old.discovery_visibility,old.is_active,old.host_user_id) then return null; end if;
  if new.discovery_paused then delete from private.room_discovery_host_consents where party_id=new.party_id; end if;
  if new.room_type='title' then perform private.sync_party_room_discovery(new.party_id);
  elsif new.room_type='live' then perform public.sync_live_stage_discovery(new.party_id); end if;
  -- Read only: never take a broadcast/playback row lock while holding the
  -- source room, so the publisher's broadcast -> room lock order cannot cycle.
  for broadcast_id in select b.id from public.room_broadcast_sessions b
    where coalesce(nullif(b.source_room_id,''),nullif(b.watch_party_room_id,''))=new.party_id loop
    perform public.sync_spectator_broadcast_discovery(broadcast_id);
  end loop;
  perform private.enqueue_room_attendance_reconciliation(new.party_id);
  return null;
end $$;

-- The ordinary spectator producer must not briefly publish a paused source
-- and then hide it: its transactional hint trigger would expose a new key.
-- Event-managed rooms are private transport, not an ordinary host's Off state.
alter function public.sync_spectator_broadcast_discovery(uuid) rename to sync_spectator_broadcast_discovery_pre_listing_pause;
revoke all on function public.sync_spectator_broadcast_discovery_pre_listing_pause(uuid) from public,anon,authenticated,service_role;
create function public.sync_spectator_broadcast_discovery(p_broadcast_session_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare b public.room_broadcast_sessions; r public.watch_party_rooms; v_source_id text;
begin
  select * into b from public.room_broadcast_sessions where id=p_broadcast_session_id;
  v_source_id:=coalesce(nullif(b.source_room_id,''),nullif(b.watch_party_room_id,''));
  if not exists(select 1 from private.creator_event_broadcast_preparations p where p.party_id=v_source_id) then
    select * into r from public.watch_party_rooms where party_id=v_source_id for share;
    if r.party_id is not null and (r.discovery_paused or not r.is_active or r.discovery_visibility='private'
      or not private.room_host_discovery_consented(r) or b.host_user_id is distinct from r.host_user_id::text
      or (r.discovery_visibility='public' and b.access_type<>'public_free')
      or (r.discovery_visibility='circle' and b.access_type<>'circle')) then
      update public.discovery_feed_items set is_publicly_discoverable=false,moderation_status='hidden',discovery_surface='none',
        is_spectator_enabled=false,is_spectator_playback_enabled=false,allow_spectator_view=false,
        allow_watch_party_from_spectator=false,allow_live_reaction_rooms=false,allow_public_share=false,
        allow_replay_watch_party=false,updated_at=now(),metadata=coalesce(metadata,'{}'::jsonb)||'{"canonical_projection_active":false}'::jsonb
        where source_type='watch_party_room' and metadata->>'producer'='canonical_spectator_broadcast_v1'
          and (discovery_feed_items.source_id=v_source_id or metadata->>'broadcast_session_id'=p_broadcast_session_id::text);
      update public.circle_spectator_feed_items set status='hidden',moderation_status='hidden',is_spectator_enabled=false,
        is_spectator_playback_enabled=false,allow_spectator_view=false,allow_watch_party_from_spectator=false,
        updated_at=now(),metadata=coalesce(metadata,'{}'::jsonb)||'{"canonical_projection_active":false}'::jsonb
        where source_type='watch_party_room' and metadata->>'producer'='canonical_spectator_broadcast_v1'
          and (circle_spectator_feed_items.source_id=v_source_id or metadata->>'broadcast_session_id'=p_broadcast_session_id::text);
      return;
    end if;
  end if;
  perform public.sync_spectator_broadcast_discovery_pre_listing_pause(p_broadcast_session_id);
end $$;
revoke all on function public.sync_spectator_broadcast_discovery(uuid) from public,anon,authenticated,service_role;
grant execute on function public.sync_spectator_broadcast_discovery(uuid) to service_role;

-- Restrictive read-time defense also covers an old projection snapshot. This
-- helper is in the unexposed private schema and returns no room metadata.
create function private.broadcast_listing_unpaused(p_source_id text,p_audience text)
returns boolean language sql stable security definer set search_path='' as $$
  select not exists(select 1 from public.watch_party_rooms r where r.party_id=p_source_id
    and (r.discovery_paused or not r.is_active or r.discovery_visibility is distinct from p_audience
      or not private.room_host_discovery_consented(r))
    and not exists(select 1 from private.creator_event_broadcast_preparations p where p.party_id=r.party_id));
$$;
revoke all on function private.broadcast_listing_unpaused(text,text) from public,anon,authenticated,service_role;
grant execute on function private.broadcast_listing_unpaused(text,text) to anon,authenticated;
create policy spectator_listing_unpaused_public on public.discovery_feed_items as restrictive for select to anon,authenticated
  using(source_type<>'watch_party_room' or private.broadcast_listing_unpaused(source_id,'public'));
create policy spectator_listing_unpaused_circle on public.circle_spectator_feed_items as restrictive for select to authenticated
  using(source_type<>'watch_party_room' or private.broadcast_listing_unpaused(source_id,'circle'));
revoke all on function private.reconcile_room_listing_pause() from public,anon,authenticated,service_role;
create trigger room_listing_pause_after_change after update of discovery_paused,discovery_visibility,is_active,host_user_id on public.watch_party_rooms
  for each row execute function private.reconcile_room_listing_pause();

-- Spectator Circle rows use the same one-per-viewer opaque primary channel.
-- Reuse the pure canonical broadcast source checks, not caller impersonation
-- or a self-only RLS predicate invoked for another recipient.
alter function private.current_circle_discovery_hint_recipients(uuid) rename to current_circle_hint_recipients_pre_listing_pause;
revoke all on function private.current_circle_hint_recipients_pre_listing_pause(uuid) from public,anon,authenticated,service_role;
create function private.current_circle_discovery_hint_recipients(p_item uuid)
returns table(host_user_id uuid,recipient_user_id uuid) language plpgsql security definer set search_path='' as $$
declare d public.circle_spectator_feed_items; r public.watch_party_rooms; source jsonb;
begin
  select * into d from public.circle_spectator_feed_items where id=p_item;
  if d.source_type is distinct from 'watch_party_room' then
    return query select * from private.current_circle_hint_recipients_pre_listing_pause(p_item); return;
  end if;
  if d.status<>'active' or d.visibility<>'circle' or d.access_type<>'circle' or d.moderation_status<>'clean'
    or d.live_state<>'live' or d.ended_at is not null or not d.is_spectator_enabled or not d.allow_spectator_view
    or d.rights_status not in ('creator_owned','chillywood_original','licensed_for_public_stream')
    or d.metadata->>'producer' is distinct from 'canonical_spectator_broadcast_v1'
    or d.metadata->>'canonical_projection_active' is distinct from 'true' then return; end if;
  select * into r from public.watch_party_rooms where party_id=d.source_id;
  if not found or not private.room_host_discovery_consented(r)
    or d.creator_user_id is distinct from r.host_user_id::text or d.host_user_id is distinct from r.host_user_id::text
    or not exists(select 1 from auth.users where id=r.host_user_id and deleted_at is null)
    or exists(select 1 from private.creator_event_broadcast_preparations where party_id=r.party_id) then return; end if;
  source:=private.discovery_notification_source('broadcast',d.broadcast_session_id::text);
  if source->>'eligible' is distinct from 'true' or source->>'audience' is distinct from 'circle'
    or source->>'owner' is distinct from r.host_user_id::text or source->>'target_entity_id' is distinct from r.party_id then return; end if;
  return query with candidates as (
    select r.host_user_id recipient union select case when f.user_low_id=r.host_user_id::text then f.user_high_id else f.user_low_id end::uuid
      from public.user_friendships f where f.status='active' and r.host_user_id::text in(f.user_low_id,f.user_high_id)
  ) select r.host_user_id,c.recipient from candidates c join auth.users u on u.id=c.recipient
    where not coalesce(u.is_anonymous,false) and u.deleted_at is null
      and not public.is_account_access_restricted(c.recipient::text)
      and not public.has_channel_audience_block_between(r.host_user_id::text,c.recipient::text)
      and (c.recipient=r.host_user_id or public.is_active_chilly_circle_member(r.host_user_id::text,c.recipient::text));
end $$;
revoke all on function private.current_circle_discovery_hint_recipients(uuid) from public,anon,authenticated,service_role;

create or replace function private.circle_discovery_relationship_changed()
returns trigger language plpgsql security definer set search_path='' as $$
declare a text; b text; row_data jsonb; item uuid; party text;
begin
  row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  if tg_table_name='user_friendships' then a:=row_data->>'user_low_id'; b:=row_data->>'user_high_id';
  else a:=row_data->>'channel_user_id'; b:=row_data->>'blocked_user_id'; end if;
  if not exists(select 1 from private.discovery_invalidation_worker_config where singleton and collecting) then return null; end if;
  -- Relationship writes may already own one relationship row. This mutex
  -- serializes only snapshot work; no path takes additional relationship-row
  -- locks while holding it, and this path never locks source room/feed rows.
  -- Attendance may have a third-party room host. Acquire the WHOLE sorted set
  -- once, never pair A/B followed by unrelated host C (which can cycle against
  -- another pair C/D hosted by A). Materializers share the pair mutexes.
  perform private.lock_discovery_hint_hosts(array(
    select unnest(array[a,b]) union select s.host_user_id::text from private.room_attendance_hint_receipts s
      where s.host_user_id::text in(a,b) or (s.actor_user_id::text in(a,b) and s.recipient_user_id::text in(a,b))));
  if tg_table_name='channel_audience_blocks' then
    insert into private.discovery_invalidation_outbox(topic,source_id,source_table)
      select 'discovery:v1:viewer:'||case when r.host_user_id::text=a then b else a end,d.id,'discovery_feed_items'
      from public.watch_party_rooms r join public.discovery_feed_items d on d.source_id=r.party_id
      where r.host_user_id::text in(a,b) and r.is_active and r.discovery_visibility='public'
        and d.source_type in ('party_room','live_stage_room','watch_party_room') and d.is_publicly_discoverable and d.visibility='public'
        and private.room_host_discovery_consented(r)
        and ((d.source_type='party_room' and private.party_room_publication_current(r.party_id))
          or (d.source_type='live_stage_room' and private.live_stage_publication_current(r.party_id))
          or (d.source_type='watch_party_room' and private.discovery_notification_source('broadcast',d.metadata->>'broadcast_session_id')->>'eligible'='true'));
  end if;
  for item in select distinct id from public.circle_spectator_feed_items
    where source_type in ('party_room','live_stage_room','watch_party_room') and (creator_user_id in(a,b) or host_user_id in(a,b))
      and (status='active' or exists(select 1 from private.circle_discovery_hint_recipients h where h.item_id=id))
  loop perform private.reconcile_circle_discovery_hints(item); end loop;
  for party in select distinct s.party_id from private.room_attendance_hint_receipts s
    where s.host_user_id::text in(a,b) or (s.actor_user_id::text in(a,b) and s.recipient_user_id::text in(a,b))
  loop perform private.enqueue_room_attendance_reconciliation(party); end loop;
  return null;
end $$;

-- Paused attendance is an unlisted current-members-only disclosure. Keep the
-- ACTUAL Circle/source/payment predicates; never substitute a private room row.
create or replace function private.live_room_join_recipient_pre_paid_stage(r public.watch_party_rooms,p_actor uuid,p_recipient uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare source jsonb;
begin
  if p_actor=p_recipient or p_recipient is null or not r.is_active
    or not exists(select 1 from public.person_notification_preferences p where p.user_id=p_recipient
      and p.actor_user_id=p_actor and p.joined_live_enabled)
    or public.is_account_access_restricted(p_recipient::text)
    or public.is_account_access_restricted(r.host_user_id::text)
    or public.account_deletion_public_hidden_reason(r.host_user_id::text) is not null
    or not exists(select 1 from public.watch_party_room_memberships h where h.party_id=r.party_id
      and h.user_id=r.host_user_id::text and h.membership_state='active' and h.left_at is null
      and h.last_seen_at>now()-interval '45 seconds')
    or public.has_channel_audience_block_between(p_actor::text,p_recipient::text)
    or public.has_channel_audience_block_between(r.host_user_id::text,p_recipient::text)
    or public.watch_party_room_actor_blocked_by_host(r.party_id,p_recipient::text)
    then return false; end if;
  if p_recipient=r.host_user_id then return true; end if;
  if not public.is_active_chilly_circle_member(p_actor::text,p_recipient::text)
    or not private.social_notification_profile_allowed(p_actor::text,p_recipient)
    or not public.watch_party_room_self_access_allowed_internal(r.party_id,p_recipient::text)
    or not private.party_room_viewer_source_allowed(r,p_recipient)
    or (r.join_policy<>'open' and not exists(select 1 from public.watch_party_room_memberships m where m.party_id=r.party_id
      and m.user_id=p_recipient::text and m.membership_state='active' and m.left_at is null
      and m.last_seen_at>now()-interval '45 seconds'))
    then return false; end if;
  if r.discovery_visibility='circle' and not public.is_active_chilly_circle_member(r.host_user_id::text,p_recipient::text) then return false; end if;
  if r.discovery_visibility='private' or r.discovery_paused then
    -- Knowing the joining person or a room code is not attendance-disclosure
    -- authority. Only an already current, authorized member can receive this.
    return exists(select 1 from public.watch_party_room_memberships m where m.party_id=r.party_id
      and m.user_id=p_recipient::text and m.membership_state='active' and m.left_at is null
      and m.last_seen_at>now()-interval '45 seconds')
      and public.watch_party_room_self_access_allowed_internal(r.party_id,p_recipient::text);
  elsif r.room_type='title' then
    return private.party_room_metadata_allowed(r.party_id,p_recipient,r.discovery_visibility);
  elsif r.room_type='live' then
    source:=private.discovery_notification_source('live_stage',r.party_id);
    return source->>'eligible'='true' and (r.discovery_visibility='public'
      or (r.discovery_visibility='circle' and public.is_active_chilly_circle_member(r.host_user_id::text,p_recipient::text)));
  end if;
  return false;
end $$;

create or replace function private.room_attendance_receipt_current(e public.notification_activity_events)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare r public.watch_party_rooms; publication jsonb; source jsonb;
begin
  if e.event_kind<>'live_room_member_joined' or e.materialized_at is null or e.notification_id is null
    or e.actor_user_id=e.recipient_user_id or e.recipient_user_id is null
    or not exists(select 1 from auth.users where id=e.actor_user_id and deleted_at is null)
    or not exists(select 1 from auth.users where id=e.recipient_user_id and deleted_at is null)
    or public.is_account_access_restricted(e.actor_user_id::text)
    or public.account_deletion_public_hidden_reason(e.actor_user_id::text) is not null
    or public.is_account_access_restricted(e.recipient_user_id::text) then return false; end if;
  select * into r from public.watch_party_rooms where party_id=e.source_id;
  select jsonb_build_array(p.publication_id,p.started_at,p.retired_at) into publication
    from (select 1) singleton left join private.party_room_discovery_publications p on p.party_id=r.party_id;
  if r.party_id is null or not r.is_active or r.notification_join_generation::text is distinct from e.context->>'generation'
    or not exists(select 1 from auth.users where id=r.host_user_id and deleted_at is null)
    or r.host_user_id::text is distinct from e.context->>'hostId' or publication is distinct from e.context->'publication'
    or public.is_account_access_restricted(r.host_user_id::text)
    or public.account_deletion_public_hidden_reason(r.host_user_id::text) is not null
    or public.has_channel_audience_block_between(e.actor_user_id::text,e.recipient_user_id::text)
    or public.has_channel_audience_block_between(r.host_user_id::text,e.recipient_user_id::text)
    or not exists(select 1 from public.person_notification_preferences p where p.user_id=e.recipient_user_id
      and p.actor_user_id=e.actor_user_id and p.joined_live_enabled)
    or not exists(select 1 from public.watch_party_room_memberships h where h.party_id=r.party_id
      and h.user_id=r.host_user_id::text and h.membership_state='active' and h.left_at is null
      and h.last_seen_at>now()-interval '45 seconds')
    or not exists(select 1 from public.notifications n where n.id=e.notification_id and n.user_id=e.recipient_user_id
      and n.actor_user_id=e.actor_user_id and n.source_type='notification_activity' and n.source_id=e.id::text
      and n.notification_type=e.event_kind and n.target_entity_id=r.party_id and n.dismissed_at is null
      and n.target_route=case when r.room_type='live' then '/watch-party/live-stage/[partyId]' else '/watch-party/[partyId]' end)
    then return false; end if;
  if e.recipient_user_id=r.host_user_id then return true; end if;
  if not public.is_active_chilly_circle_member(e.actor_user_id::text,e.recipient_user_id::text)
    or not private.social_notification_profile_allowed(e.actor_user_id::text,e.recipient_user_id)
    or not private.room_attendance_source_access_current(r,e.recipient_user_id)
    or not private.party_room_viewer_source_allowed(r,e.recipient_user_id)
    or ((r.join_policy<>'open' or r.discovery_visibility='private' or r.discovery_paused) and not exists(
      select 1 from public.watch_party_room_memberships m where m.party_id=r.party_id and m.user_id=e.recipient_user_id::text
        and m.membership_state='active' and m.left_at is null and m.last_seen_at>now()-interval '45 seconds'))
    then return false; end if;
  if r.discovery_visibility='circle' and not public.is_active_chilly_circle_member(r.host_user_id::text,e.recipient_user_id::text) then return false; end if;
  if r.discovery_visibility='private' or r.discovery_paused then return true;
  elsif r.room_type='title' then return private.party_room_metadata_allowed(r.party_id,e.recipient_user_id,r.discovery_visibility);
  elsif r.room_type='live' then
    source:=private.discovery_notification_source('live_stage',r.party_id);
    return source->>'eligible'='true' and (r.discovery_visibility='public'
      or (r.discovery_visibility='circle' and public.is_active_chilly_circle_member(r.host_user_id::text,e.recipient_user_id::text)));
  end if;
  return false;
end $$;

create or replace function public.publish_live_stage_discovery_current(p_party_id text,p_actor_user_id uuid,
  p_session_generation uuid,p_expected_room_generation uuid,p_expected_settings_revision bigint)
returns boolean language plpgsql security definer set search_path='' as $$
declare r public.watch_party_rooms; publication_started timestamptz;
begin
  select * into r from public.watch_party_rooms where party_id=upper(btrim(p_party_id)) for update;
  if not found or r.host_user_id is distinct from p_actor_user_id or r.room_type<>'live' or not r.is_active
    or r.discovery_visibility='private' or r.discovery_paused or r.room_generation is distinct from p_expected_room_generation
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
