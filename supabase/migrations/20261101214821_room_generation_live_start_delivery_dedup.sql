-- One start announcement per actual room lifecycle and recipient, independent
-- of its eligible transport. No historical binding/backfill or publication.
alter table public.room_broadcast_sessions
  add column notification_room_id text,
  add column notification_room_generation uuid,
  add column notification_room_host uuid;

create function private.bind_broadcast_notification_room()
returns trigger language plpgsql security definer set search_path='' as $$
declare r public.watch_party_rooms;
begin
  if tg_op='UPDATE' then
    if (new.notification_room_id,new.notification_room_generation,new.notification_room_host)
      is distinct from (old.notification_room_id,old.notification_room_generation,old.notification_room_host)
      then raise exception 'broadcast_notification_binding_immutable'; end if;
    return new;
  end if;
  new.notification_room_id:=null;new.notification_room_generation:=null;new.notification_room_host:=null;
  if new.source_type<>'watch_party_room' then return new; end if;
  select * into r from public.watch_party_rooms
    where party_id=coalesce(nullif(new.source_room_id,''),nullif(new.watch_party_room_id,'')) for share;
  if r.party_id is not null and r.host_user_id=private.discovery_notification_uuid(coalesce(new.host_user_id,new.channel_user_id))
    and not exists(select 1 from private.creator_event_broadcast_preparations p where p.party_id=r.party_id) then
    new.notification_room_id:=r.party_id;new.notification_room_generation:=r.room_generation;
    new.notification_room_host:=r.host_user_id;
  end if;
  return new;
end $$;
revoke all on function private.bind_broadcast_notification_room() from public,anon,authenticated,service_role;
create trigger broadcast_notification_binding_before_write before insert or update on public.room_broadcast_sessions
  for each row execute function private.bind_broadcast_notification_room();

alter function private.discovery_notification_source(text,text) rename to discovery_notification_source_pre_room_start_binding;
create function private.discovery_notification_source(p_type text,p_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;b public.room_broadcast_sessions;r public.watch_party_rooms;
begin
  result:=private.discovery_notification_source_pre_room_start_binding(p_type,p_id);
  if result->>'eligible'='true' and p_type='broadcast' then
    select * into b from public.room_broadcast_sessions where id=private.discovery_notification_uuid(p_id);
    select * into r from public.watch_party_rooms where party_id=result->>'target_entity_id';
    -- Event-managed private transport retains its separate preparation and
    -- provider-operation authority; this is only the ordinary start lane.
    if not exists(select 1 from private.creator_event_broadcast_preparations p where p.party_id=r.party_id
      and p.broadcast_session_id=b.id and p.creator_event_id::text=b.creator_event_id and p.host_user_id=r.host_user_id
      and p.host_user_id::text=b.host_user_id)
      and (b.notification_room_id is distinct from r.party_id or b.notification_room_generation is distinct from r.room_generation
        or b.notification_room_host is distinct from r.host_user_id or b.notification_room_generation is null)
      then return '{"eligible":false}'; end if;
  end if;
  return result;
end $$;
revoke all on function private.discovery_notification_source(text,text),private.discovery_notification_source_pre_room_start_binding(text,text)
  from public,anon,authenticated,service_role;

create table private.room_start_notification_bindings (
  event_id uuid primary key references public.notification_activity_events(id) on delete cascade,
  party_id text not null references public.watch_party_rooms(party_id) on delete cascade,
  room_generation uuid not null,host_user_id uuid not null,recipient_user_id uuid not null,
  source_type text not null,source_id text not null,source_revision text not null,source_audience text not null,
  event_kind text not null
);
create index room_start_notification_binding_scope on private.room_start_notification_bindings(party_id,room_generation,recipient_user_id);
alter table private.room_start_notification_bindings enable row level security;
alter table private.room_start_notification_bindings force row level security;
revoke all on private.room_start_notification_bindings from public,anon,authenticated,service_role;

create function private.bind_room_start_notification_candidate()
returns trigger language plpgsql security definer set search_path='' as $$
declare r public.watch_party_rooms;s jsonb;t text:=new.context->>'sourceType';
begin
  if new.event_kind not in ('followed_creator_live','circle_friend_live') or t not in ('live_stage','party_room','broadcast')
    then return new; end if;
  s:=case when t='party_room' then private.party_room_notification_source(new.source_id)
    else private.discovery_notification_source(t,new.source_id) end;
  if s->>'eligible' is distinct from 'true' or s->>'owner' is distinct from new.actor_user_id::text
    or s->>'revision' is distinct from new.context->>'revision' or s->>'audience' is distinct from new.context->>'audience'
    then return new; end if;
  select * into r from public.watch_party_rooms where party_id=case when t='broadcast' then s->>'target_entity_id' else new.source_id end for share;
  if r.party_id is null or not r.is_active or r.host_user_id is distinct from new.actor_user_id
    or exists(select 1 from private.creator_event_broadcast_preparations p where p.party_id=r.party_id) then return new; end if;
  insert into private.room_start_notification_bindings(event_id,party_id,room_generation,host_user_id,recipient_user_id,
    source_type,source_id,source_revision,source_audience,event_kind)
    values(new.id,r.party_id,r.room_generation,r.host_user_id,new.recipient_user_id,t,new.source_id,s->>'revision',s->>'audience',new.event_kind);
  return new;
end $$;
revoke all on function private.bind_room_start_notification_candidate() from public,anon,authenticated,service_role;
create trigger room_start_candidate_after_insert after insert on public.notification_activity_events
  for each row execute function private.bind_room_start_notification_candidate();

create function private.current_room_start_notification_binding(e public.notification_activity_events)
returns private.room_start_notification_bindings language sql stable security definer set search_path='' as $$
  select b from private.room_start_notification_bindings b join public.watch_party_rooms r on r.party_id=b.party_id
  where b.event_id=e.id and r.is_active and r.room_generation=b.room_generation and r.host_user_id=b.host_user_id
    and b.host_user_id=e.actor_user_id and b.recipient_user_id=e.recipient_user_id and b.source_id=e.source_id
    and b.event_kind=e.event_kind and b.source_type=e.context->>'sourceType'
    and b.source_revision=e.context->>'revision' and b.source_audience=e.context->>'audience';
$$;
revoke all on function private.current_room_start_notification_binding(public.notification_activity_events) from public,anon,authenticated,service_role;

alter function private.resolve_discovery_notification_activity(public.notification_activity_events)
  rename to resolve_discovery_notification_pre_room_start_binding;
create function private.resolve_discovery_notification_activity(e public.notification_activity_events)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;b private.room_start_notification_bindings;
begin
  result:=private.resolve_discovery_notification_pre_room_start_binding(e);
  if result->>'eligible'='true' and e.event_kind in ('followed_creator_live','circle_friend_live') then
    b:=private.current_room_start_notification_binding(e);
    if b.event_id is null then return '{"eligible":false}'; end if;
  end if;
  return result;
end $$;
revoke all on function private.resolve_discovery_notification_activity(public.notification_activity_events),
  private.resolve_discovery_notification_pre_room_start_binding(public.notification_activity_events) from public,anon,authenticated,service_role;

create table private.room_start_notification_deliveries (
  party_id text not null references public.watch_party_rooms(party_id) on delete cascade,
  room_generation uuid not null,recipient_user_id uuid not null references auth.users(id) on delete cascade,
  winner_event_id uuid not null,in_app_delivered boolean not null default false,created_at timestamptz not null default now(),
  primary key(party_id,room_generation,recipient_user_id)
);
alter table private.room_start_notification_deliveries enable row level security;
alter table private.room_start_notification_deliveries force row level security;
revoke all on private.room_start_notification_deliveries from public,anon,authenticated,service_role;

-- Caller holds source room FOR SHARE, then this exact scope mutex, before
-- taking any event-row lock. A candidate alone never consumes a delivery.
create function private.room_start_notification_delivery_state(b private.room_start_notification_bindings)
returns text language plpgsql security definer set search_path='' as $$
declare d private.room_start_notification_deliveries;
begin
  perform pg_advisory_xact_lock(hashtextextended('room-live-start:'||jsonb_build_array(b.party_id,b.room_generation,b.recipient_user_id)::text,0));
  select * into d from private.room_start_notification_deliveries
    where party_id=b.party_id and room_generation=b.room_generation and recipient_user_id=b.recipient_user_id;
  if not found then return 'unowned'; end if;
  if d.winner_event_id=b.event_id then return 'same'; end if;
  if d.in_app_delivered or not exists(select 1 from public.notification_activity_events where id=d.winner_event_id)
    or exists(select 1 from public.notification_activity_pushes where event_id=d.winner_event_id and status in ('sent','unknown'))
    then return 'delivered'; end if;
  if exists(select 1 from public.notification_activity_pushes where event_id=d.winner_event_id and status='sending') then return 'pending'; end if;
  -- Absence is not proof of no-send. Release only retained explicit provider
  -- rejection records, never an uncertain/lost result or retention tombstone.
  if exists(select 1 from public.notification_activity_pushes where event_id=d.winner_event_id)
    and not exists(select 1 from public.notification_activity_pushes where event_id=d.winner_event_id and status not in ('failed','retryable')) then
    delete from private.room_start_notification_deliveries where party_id=b.party_id and room_generation=b.room_generation and recipient_user_id=b.recipient_user_id;
    return 'unowned';
  end if;
  return 'delivered';
end $$;
revoke all on function private.room_start_notification_delivery_state(private.room_start_notification_bindings) from public,anon,authenticated,service_role;

create function private.defer_duplicate_room_start(e public.notification_activity_events,p_state text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  update public.notification_activity_events set status=case when p_state='pending' then 'pending' else 'suppressed' end,
    scheduled_at=case when p_state='pending' then now()+interval '5 seconds' else scheduled_at end,
    completed_at=case when p_state='pending' then null else now() end,lease_token=null,lease_until=null
    where id=e.id and status='leased' and lease_token=e.lease_token and lease_until>now();
  return jsonb_build_object('eligible',false,'reason',case when p_state='pending' then 'room_start_delivery_pending' else 'room_start_already_delivered' end);
end $$;
revoke all on function private.defer_duplicate_room_start(public.notification_activity_events,text) from public,anon,authenticated,service_role;

alter function public.prepare_notification_activity(uuid,uuid) rename to prepare_notification_activity_pre_room_start;
create function public.prepare_notification_activity(p_event_id uuid,p_lease_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.notification_activity_events;b private.room_start_notification_bindings;result jsonb;state text;
begin
  select * into e from public.notification_activity_events where id=p_event_id;
  b:=private.current_room_start_notification_binding(e);
  if b.event_id is null or e.status<>'leased' or e.lease_token is distinct from p_lease_token or e.lease_until<=now()
    then return public.prepare_notification_activity_pre_room_start(p_event_id,p_lease_token); end if;
  perform 1 from public.watch_party_rooms where party_id=b.party_id for share;
  b:=private.current_room_start_notification_binding(e);
  if b.event_id is null then return public.prepare_notification_activity_pre_room_start(p_event_id,p_lease_token); end if;
  state:=private.room_start_notification_delivery_state(b);
  if private.resolve_notification_activity(e)->>'eligible'='true' and state in ('delivered','pending')
    then return private.defer_duplicate_room_start(e,state); end if;
  result:=public.prepare_notification_activity_pre_room_start(p_event_id,p_lease_token);
  select * into e from public.notification_activity_events where id=p_event_id;
  if result->>'eligible'='true' and e.notification_id is not null and e.materialized_at is not null and exists(
    select 1 from public.notifications n where n.id=e.notification_id and n.user_id=e.recipient_user_id
      and n.source_type='notification_activity' and n.source_id=e.id::text) then
    insert into private.room_start_notification_deliveries(party_id,room_generation,recipient_user_id,winner_event_id,in_app_delivered)
      values(b.party_id,b.room_generation,b.recipient_user_id,e.id,true)
      on conflict(party_id,room_generation,recipient_user_id) do update set in_app_delivered=true
      where room_start_notification_deliveries.winner_event_id=excluded.winner_event_id;
  end if;
  return result;
end $$;
revoke all on function public.prepare_notification_activity_pre_room_start(uuid,uuid),public.prepare_notification_activity(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.prepare_notification_activity(uuid,uuid) to service_role;

alter function public.reserve_notification_activity_push(uuid,uuid,uuid) rename to reserve_notification_activity_push_pre_room_start;
create function public.reserve_notification_activity_push(p_event_id uuid,p_lease_token uuid,p_push_token_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.notification_activity_events;b private.room_start_notification_bindings;result jsonb;state text;
begin
  select * into e from public.notification_activity_events where id=p_event_id;
  b:=private.current_room_start_notification_binding(e);
  if b.event_id is null or e.status<>'leased' or e.lease_token is distinct from p_lease_token or e.lease_until<=now()
    then return public.reserve_notification_activity_push_pre_room_start(p_event_id,p_lease_token,p_push_token_id); end if;
  perform 1 from public.watch_party_rooms where party_id=b.party_id for share;
  b:=private.current_room_start_notification_binding(e);
  if b.event_id is null then return public.reserve_notification_activity_push_pre_room_start(p_event_id,p_lease_token,p_push_token_id); end if;
  state:=private.room_start_notification_delivery_state(b);
  if state in ('delivered','pending') then return private.defer_duplicate_room_start(e,state); end if;
  result:=public.reserve_notification_activity_push_pre_room_start(p_event_id,p_lease_token,p_push_token_id);
  if result->>'eligible'='true' then
    insert into private.room_start_notification_deliveries(party_id,room_generation,recipient_user_id,winner_event_id)
      values(b.party_id,b.room_generation,b.recipient_user_id,e.id) on conflict do nothing;
  end if;
  return result;
end $$;
revoke all on function public.reserve_notification_activity_push_pre_room_start(uuid,uuid,uuid),
  public.reserve_notification_activity_push(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.reserve_notification_activity_push(uuid,uuid,uuid) to service_role;
