-- New confirmed attendance only. No backfill, provider calls or discovery grants.
create table public.person_notification_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  live_starts_enabled boolean,
  watch_party_starts_enabled boolean,
  joined_live_enabled boolean not null default false,
  revision bigint not null default 1 check(revision>0),
  updated_at timestamptz not null default now(),
  primary key(user_id,actor_user_id), check(user_id<>actor_user_id)
);
create index person_notification_join_optins on public.person_notification_preferences(actor_user_id,user_id) where joined_live_enabled;
alter table public.person_notification_preferences enable row level security;
alter table public.person_notification_preferences force row level security;
revoke all on public.person_notification_preferences from public,anon,authenticated,service_role;
-- No direct API table reads/writes: narrow RPCs bind the exact current session,
-- rather than permitting a still-valid JWT from a retired session through RLS.

create function public.read_person_notification_preferences(p_actor_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.person_notification_preferences; follows boolean; friend boolean;
begin
  if not public.whole_app_exact_current_session_authority_internal() or auth.uid() is null
    or p_actor_user_id is null or p_actor_user_id=auth.uid()
    or not private.social_notification_profile_allowed(p_actor_user_id::text,auth.uid())
    then raise exception 'person_notification_access_required'; end if;
  select * into p from public.person_notification_preferences where user_id=auth.uid() and actor_user_id=p_actor_user_id;
  follows:=exists(select 1 from public.channel_followers where channel_user_id=p_actor_user_id::text and follower_user_id=auth.uid()::text);
  friend:=public.is_active_chilly_circle_member(p_actor_user_id::text,auth.uid()::text);
  return jsonb_build_object('actorUserId',p_actor_user_id,'liveStarts',p.live_starts_enabled,'watchPartyStarts',p.watch_party_starts_enabled,
    'joinedLive',coalesce(p.joined_live_enabled,false),'revision',coalesce(p.revision,0),'following',follows,'circle',friend);
end $$;
create function public.set_person_notification_preferences(p_actor_user_id uuid,p_live_starts boolean,p_watch_party_starts boolean,p_joined_live boolean,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_value jsonb;
begin
  current_value:=public.read_person_notification_preferences(p_actor_user_id);
  if p_joined_live is null or p_expected_revision is null or p_expected_revision<0 then raise exception 'person_notification_invalid_preference'; end if;
  perform pg_advisory_xact_lock(hashtextextended('person-notifications:'||auth.uid()::text||':'||p_actor_user_id::text,0));
  current_value:=public.read_person_notification_preferences(p_actor_user_id);
  if (current_value->>'revision')::bigint<>p_expected_revision then raise exception 'person_notification_conflict'; end if;
  insert into public.person_notification_preferences(user_id,actor_user_id,live_starts_enabled,watch_party_starts_enabled,joined_live_enabled)
    values(auth.uid(),p_actor_user_id,p_live_starts,p_watch_party_starts,p_joined_live)
  on conflict(user_id,actor_user_id) do update set live_starts_enabled=excluded.live_starts_enabled,
    watch_party_starts_enabled=excluded.watch_party_starts_enabled,joined_live_enabled=excluded.joined_live_enabled,
    revision=public.person_notification_preferences.revision+1,updated_at=now();
  return public.read_person_notification_preferences(p_actor_user_id);
end $$;
revoke all on function public.read_person_notification_preferences(uuid),public.set_person_notification_preferences(uuid,boolean,boolean,boolean,bigint) from public,anon,authenticated,service_role;
grant execute on function public.read_person_notification_preferences(uuid),public.set_person_notification_preferences(uuid,boolean,boolean,boolean,bigint) to authenticated;

create function public.list_person_notification_preferences(p_after uuid default null,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.whole_app_exact_current_session_authority_internal() then raise exception 'person_notification_access_required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('actorUserId',p.actor_user_id,'displayName',
    coalesce(private.notification_subject_label(u.display_name,80),private.notification_subject_label(u.username,60),'Member')) order by p.actor_user_id),'[]'::jsonb)
    into result from (select actor_user_id from public.person_notification_preferences where user_id=auth.uid()
      and (p_after is null or actor_user_id>p_after)
      and private.social_notification_profile_allowed(actor_user_id::text,auth.uid())
      order by actor_user_id limit greatest(1,least(coalesce(p_limit,20),50))) p
    join public.user_profiles u on u.user_id=p.actor_user_id::text;
  return result;
end $$;
revoke all on function public.list_person_notification_preferences(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.list_person_notification_preferences(uuid,integer) to authenticated;

alter function private.resolve_discovery_notification_activity(public.notification_activity_events)
  rename to resolve_discovery_notification_pre_person_preferences;
create function private.resolve_discovery_notification_activity(p_event public.notification_activity_events)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare preference boolean;
begin
  if p_event.event_kind in ('followed_creator_live','circle_friend_live') then
    select case when p_event.context->>'sourceType' in ('party_room','broadcast') then watch_party_starts_enabled else live_starts_enabled end
      into preference from public.person_notification_preferences where user_id=p_event.recipient_user_id and actor_user_id=p_event.actor_user_id;
    if preference is false then return '{"eligible":false}'; end if;
  end if;
  -- ON never creates Follow/Circle membership or bypasses global preferences.
  return private.resolve_discovery_notification_pre_person_preferences(p_event);
end $$;
revoke all on function private.resolve_discovery_notification_pre_person_preferences(public.notification_activity_events),
  private.resolve_discovery_notification_activity(public.notification_activity_events) from public,anon,authenticated,service_role;

-- Server-owned lifecycle identity lives on the already locked room row. No
-- new membership -> generation -> room lock order is introduced by heartbeats.
alter table public.watch_party_rooms
  add column notification_join_generation uuid not null default gen_random_uuid(),
  add column notification_join_started_at timestamptz not null default now();

create function private.rotate_live_room_join_generation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    new.notification_join_generation:=gen_random_uuid();
    new.notification_join_started_at:=greatest(new.created_at,new.started_at,new.discovery_started_at);
  elsif (new.is_active,new.host_user_id,new.room_type,new.source_type,new.source_id,new.title_id,new.started_at,new.discovery_started_at)
    is distinct from (old.is_active,old.host_user_id,old.room_type,old.source_type,old.source_id,old.title_id,old.started_at,old.discovery_started_at) then
    new.notification_join_generation:=gen_random_uuid();
    new.notification_join_started_at:=clock_timestamp();
  else
    new.notification_join_generation:=old.notification_join_generation;
    new.notification_join_started_at:=old.notification_join_started_at;
  end if;
  return new;
end $$;
revoke all on function private.rotate_live_room_join_generation() from public,anon,authenticated,service_role;
create trigger rotate_live_room_join_generation before insert or update on public.watch_party_rooms
  for each row execute function private.rotate_live_room_join_generation();

-- Preserve every existing type restriction and append precisely this one type.
do $$ declare expression text; begin
  select pg_get_expr(conbin,conrelid) into strict expression from pg_constraint
    where conrelid='public.notifications'::regclass and conname='notifications_notification_type_check';
  alter table public.notifications drop constraint notifications_notification_type_check;
  execute 'alter table public.notifications add constraint notifications_notification_type_check check (('
    ||expression||') or notification_type=''live_room_member_joined'')';
end $$;

create function private.live_room_join_recipient_allowed(r public.watch_party_rooms,p_actor uuid,p_recipient uuid)
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
  if r.discovery_visibility='private' then
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
revoke all on function private.live_room_join_recipient_allowed(public.watch_party_rooms,uuid,uuid) from public,anon,authenticated,service_role;

-- One transactional qualification per actual lifecycle/publication and actor,
-- even when nobody is opted in. No foreign keys: the membership heartbeat must
-- not acquire parent room/user locks in reverse lifecycle-cleanup order.
create table private.live_room_join_qualifications (
  generation uuid not null,
  publication_hash text not null,
  actor_user_id uuid not null,
  party_id text not null,
  qualified_at timestamptz not null default now(),
  primary key(generation,publication_hash,actor_user_id)
);
create index live_room_join_qualification_retirement on private.live_room_join_qualifications(qualified_at);
alter table private.live_room_join_qualifications enable row level security;
alter table private.live_room_join_qualifications force row level security;
revoke all on private.live_room_join_qualifications from public,anon,authenticated,service_role;

-- Reuse the existing notification worker cadence, including idle batches. Keep
-- active lifecycle claims regardless of age: TTL eviction would replay old
-- attendance to later opt-ins. No FK or parent-row locks enter the heartbeat.
alter function public.claim_notification_activity_batch(integer)
  rename to claim_notification_activity_batch_pre_join_retirement;
revoke all on function public.claim_notification_activity_batch_pre_join_retirement(integer) from public,anon,authenticated,service_role;
create function public.claim_notification_activity_batch(p_limit integer default 10)
returns setof jsonb language plpgsql security definer set search_path='' as $$
begin
  with obsolete as (
    select q.generation,q.publication_hash,q.actor_user_id
    from private.live_room_join_qualifications q
    left join public.watch_party_rooms r on r.party_id=q.party_id
    left join private.party_room_discovery_publications p on p.party_id=q.party_id
    left join auth.users u on u.id=q.actor_user_id
    where u.id is null or u.raw_app_meta_data->>'accountDeidentified'='true'
      or r.party_id is null or not r.is_active or r.notification_join_generation<>q.generation
      or md5(jsonb_build_array(p.publication_id,p.started_at,p.retired_at)::text)<>q.publication_hash
      or p.retired_at is not null
    order by q.qualified_at,q.generation,q.publication_hash,q.actor_user_id
    limit 100 for update of q skip locked
  ) delete from private.live_room_join_qualifications q using obsolete o
    where (q.generation,q.publication_hash,q.actor_user_id)=(o.generation,o.publication_hash,o.actor_user_id);
  return query select * from public.claim_notification_activity_batch_pre_join_retirement(p_limit);
end $$;
revoke all on function public.claim_notification_activity_batch(integer) from public,anon,authenticated;
grant execute on function public.claim_notification_activity_batch(integer) to service_role;

create function private.enqueue_confirmed_live_room_join()
returns trigger language plpgsql security definer set search_path='' as $$
declare r public.watch_party_rooms; publication jsonb; generation_start timestamptz; snapshot record;
  actor_session uuid; who record; authority jsonb;
begin
  -- Same confirmation boundary as qualified live viewing: not initial row
  -- creation, reconnecting state, another user's update or a stale callback.
  if not public.whole_app_exact_current_session_authority_internal()
    or auth.uid()::text is distinct from new.user_id
    or not exists(select 1 from auth.users u where u.id=auth.uid()
      and coalesce(u.raw_app_meta_data->>'accountDeidentified','false')<>'true')
    or new.membership_state<>'active' or old.membership_state<>'active'
    or new.left_at is not null or old.left_at is not null
    or new.joined_at is distinct from old.joined_at
    or new.joined_at>now()-interval '10 seconds'
    or old.last_seen_at<now()-interval '45 seconds'
    or new.last_seen_at is not distinct from old.last_seen_at
    or new.last_seen_at<now()-interval '5 seconds' or new.last_seen_at>now()+interval '1 second'
    then return new; end if;
  -- One statement snapshot binds the room generation and Party publication.
  select room as room_row,jsonb_build_array(p.publication_id,p.started_at,p.retired_at) as publication,
    greatest(room.notification_join_started_at,p.started_at) as generation_start
    into snapshot from public.watch_party_rooms room
    left join private.party_room_discovery_publications p on p.party_id=room.party_id where room.party_id=new.party_id;
  if not found then return new; end if;
  r:=snapshot.room_row; publication:=snapshot.publication; generation_start:=snapshot.generation_start;
  -- A retired publication is terminal until the canonical publisher creates a
  -- new identity. Do not recreate a claim that the worker must immediately
  -- retire, which would reopen late-opt-in fanout on subsequent heartbeats.
  if publication->>2 is not null then return new; end if;
  if not r.is_active or r.room_type not in ('live','title') or r.host_user_id=auth.uid()
    or not exists(select 1 from public.watch_party_room_memberships h where h.party_id=r.party_id
      and h.user_id=r.host_user_id::text and h.membership_state='active' and h.left_at is null
      and h.last_seen_at>now()-interval '45 seconds') then return new; end if;
  actor_session:=private.discovery_notification_uuid(auth.jwt()->>'session_id');
  authority:=public.resolve_watch_party_livekit_viewer_authority(r.party_id,auth.uid(),actor_session);
  if actor_session is null or authority->>'allowed' is distinct from 'true' then return new; end if;
  if new.joined_at<generation_start then return new; end if;
  insert into private.live_room_join_qualifications(generation,publication_hash,actor_user_id,party_id)
    values(r.notification_join_generation,md5(publication::text),auth.uid(),r.party_id)
    on conflict do nothing;
  if not found then return new; end if;
  -- Claim and outbox fanout commit together. A failed enqueue rolls back the
  -- claim; later heartbeats can retry, but later opt-ins cannot replay an old
  -- successful qualification and reconnects cannot produce a second fanout.
  -- Candidate enqueue contains no display text. Dispatch revalidates current
  -- audience, membership, profile visibility, blocks and preferences.
  -- Explicit per-person opt-in only, including the host. Never automatically
  -- subscribe the host or every Circle friend to attendance announcements.
  for who in select p.user_id as id from public.person_notification_preferences p
    where p.actor_user_id=auth.uid() and p.joined_live_enabled
      and (p.user_id=r.host_user_id or public.is_active_chilly_circle_member(new.user_id,p.user_id::text))
  loop
    if who.id is not null and who.id<>auth.uid() then
      perform private.enqueue_notification_activity('live-join:'||r.notification_join_generation||':'||md5(publication::text)||':'||auth.uid()||':'||who.id,
        'live_room_member_joined',r.party_id,auth.uid(),who.id,
        jsonb_build_object('generation',r.notification_join_generation,'publication',publication,'actorSession',actor_session,'joinedAt',new.joined_at::text,'hostId',r.host_user_id),
        now(),now()+interval '10 minutes');
    end if;
  end loop;
  return new;
end $$;
revoke all on function private.enqueue_confirmed_live_room_join() from public,anon,authenticated,service_role;
create trigger enqueue_confirmed_live_room_join after update of last_seen_at on public.watch_party_room_memberships
  for each row execute function private.enqueue_confirmed_live_room_join();

alter function private.resolve_social_notification_activity(public.notification_activity_events)
  rename to resolve_social_notification_pre_live_room_join;
create function private.resolve_social_notification_activity(p_event public.notification_activity_events)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.watch_party_rooms; m public.watch_party_room_memberships; name text; handle text; publication jsonb; generation_start timestamptz; snapshot record;
  room_title text; actor_session uuid; authority jsonb;
begin
  if p_event.event_kind<>'live_room_member_joined' then
    return private.resolve_social_notification_pre_live_room_join(p_event); end if;
  select room as room_row,jsonb_build_array(p.publication_id,p.started_at,p.retired_at) as publication,greatest(room.notification_join_started_at,p.started_at) as generation_start
    into snapshot from public.watch_party_rooms room
    left join private.party_room_discovery_publications p on p.party_id=room.party_id where room.party_id=p_event.source_id;
  if not found then return '{"eligible":false}'; end if;
  r:=snapshot.room_row; publication:=snapshot.publication; generation_start:=snapshot.generation_start;
  if not r.is_active or r.host_user_id::text is distinct from p_event.context->>'hostId'
    or r.notification_join_generation::text is distinct from p_event.context->>'generation'
    or publication is distinct from p_event.context->'publication'
    or not private.live_room_join_recipient_allowed(r,p_event.actor_user_id,p_event.recipient_user_id)
    then return '{"eligible":false}'; end if;
  select * into m from public.watch_party_room_memberships where party_id=r.party_id and user_id=p_event.actor_user_id::text;
  if not found or m.membership_state<>'active' or m.left_at is not null
    or m.joined_at::text is distinct from p_event.context->>'joinedAt' or m.joined_at<generation_start
    or m.last_seen_at<now()-interval '45 seconds' then return '{"eligible":false}'; end if;
  actor_session:=private.discovery_notification_uuid(p_event.context->>'actorSession');
  if actor_session is null or not exists(select 1 from auth.sessions s where s.id=actor_session
    and s.user_id=p_event.actor_user_id and (s.not_after is null or s.not_after>now())) then return '{"eligible":false}'; end if;
  authority:=public.resolve_watch_party_livekit_viewer_authority(r.party_id,p_event.actor_user_id,actor_session);
  if authority->>'allowed' is distinct from 'true' then return '{"eligible":false}'; end if;
  if private.social_notification_profile_allowed(p_event.actor_user_id::text,p_event.recipient_user_id) then
    select private.notification_subject_label(display_name,80),private.notification_subject_label(username,60)
      into name,handle from public.user_profiles where user_id=p_event.actor_user_id::text;
    if name is null then name:=case when handle is not null then '@'||handle end;
    elsif handle is not null and lower(name) not in(lower(handle),lower('@'||handle)) then name:=name||' (@'||handle||')'; end if;
  elsif p_event.recipient_user_id=r.host_user_id then
    -- Host already has authorized roster access, not private profile access.
    name:=private.notification_subject_label(m.display_name,80);
  end if;
  if name is null then return '{"eligible":false}'; end if;
  room_title:=coalesce(private.notification_subject_label(r.discovery_title,160),
    case when r.room_type='title' then private.notification_subject_label(private.party_room_content_metadata(r)->>'title',160) end,
    case when r.room_type='live' then 'Live Stage' else 'Watch-Party Live' end);
  return jsonb_build_object('eligible',true,'category',case when p_event.recipient_user_id=r.host_user_id then 'social_activity' else 'circle_activity' end,
    'notification_type','live_room_member_joined','title',name||case when p_event.recipient_user_id=r.host_user_id then ' joined your live' else ' joined a live' end,
    'body',room_title,'target_route',case when r.room_type='live' then '/watch-party/live-stage/[partyId]' else '/watch-party/[partyId]' end,
    'target_entity_id',r.party_id,'target_context',jsonb_build_object('display_context',jsonb_build_object('version',1,'actor_id',p_event.actor_user_id,
      'actor_display_name',name,'target_id',r.party_id,'subject_title',room_title)),
    'preference_key',case when p_event.recipient_user_id=r.host_user_id then 'social_activity_enabled' else 'circle_activity_enabled' end);
end $$;
revoke all on function private.resolve_social_notification_pre_live_room_join(public.notification_activity_events),
  private.resolve_social_notification_activity(public.notification_activity_events) from public,anon,authenticated,service_role;

-- Exact own-notification display context. Never hydrate this attendance type
-- through the room HOST label; its actor is the person who joined.
alter function public.read_my_notification_display_context(uuid[])
  rename to read_my_notification_display_context_pre_live_join;
create function public.read_my_notification_display_context(p_notification_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; items jsonb:='[]'; item jsonb; n public.notifications; event public.notification_activity_events;
  r public.watch_party_rooms; publication jsonb; name text; handle text; subject text;
begin
  result:=public.read_my_notification_display_context_pre_live_join(p_notification_ids);
  for item in select value from jsonb_array_elements(result->'items') loop
    if item->>'notificationType'<>'live_room_member_joined' then items:=items||jsonb_build_array(item); continue; end if;
    name:=null; handle:=null; subject:=null;
    select * into n from public.notifications where id=private.discovery_notification_uuid(item->>'notificationId') and user_id=auth.uid();
    select * into event from public.notification_activity_events a where a.notification_id=n.id
      and a.recipient_user_id=auth.uid() and a.actor_user_id=n.actor_user_id and a.event_kind='live_room_member_joined'
      and a.source_id=n.target_entity_id order by a.id limit 1;
    if found then
      select * into r from public.watch_party_rooms where party_id=event.source_id;
      select jsonb_build_array(p.publication_id,p.started_at,p.retired_at) into publication
        from (select 1) singleton left join private.party_room_discovery_publications p on p.party_id=r.party_id;
      if r.party_id is not null and r.notification_join_generation::text=event.context->>'generation'
        and publication=event.context->'publication' and r.host_user_id::text=event.context->>'hostId'
        and n.target_route=(case when r.room_type='live' then '/watch-party/live-stage/[partyId]' else '/watch-party/[partyId]' end)
        and not public.is_account_access_restricted(event.actor_user_id::text)
        and public.account_deletion_public_hidden_reason(event.actor_user_id::text) is null
        and private.live_room_join_recipient_allowed(r,event.actor_user_id,auth.uid()) then
        if private.social_notification_profile_allowed(event.actor_user_id::text,auth.uid()) then
          select private.notification_subject_label(display_name,80),private.notification_subject_label(username,60)
            into name,handle from public.user_profiles where user_id=event.actor_user_id::text;
          if name is null then name:=case when handle is not null then '@'||handle end;
          elsif handle is not null and lower(name) not in(lower(handle),lower('@'||handle)) then name:=name||' (@'||handle||')'; end if;
        elsif auth.uid()=r.host_user_id then
          select private.notification_subject_label(display_name,80) into name from public.watch_party_room_memberships
            where party_id=r.party_id and user_id=event.actor_user_id::text and membership_state='active' and left_at is null;
        end if;
        if name is not null then subject:=coalesce(private.notification_subject_label(r.discovery_title,160),
          case when r.room_type='title' then private.notification_subject_label(private.party_room_content_metadata(r)->>'title',160) end,
          case when r.room_type='live' then 'Live Stage' else 'Watch-Party Live' end); end if;
      end if;
    end if;
    items:=items||jsonb_build_array(item||jsonb_build_object('creatorName',name,'targetTitle',subject,
      'resolution',case when name is null then 'unavailable' else 'resolved' end));
  end loop;
  return result||jsonb_build_object('items',items);
end $$;
revoke all on function public.read_my_notification_display_context_pre_live_join(uuid[]),public.read_my_notification_display_context(uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.read_my_notification_display_context(uuid[]) to authenticated;
