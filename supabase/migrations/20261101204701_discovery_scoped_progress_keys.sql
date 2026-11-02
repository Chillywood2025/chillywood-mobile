-- Independent random keys identify affected authorized projections, never room,
-- user, title or event IDs. They are reconciliation hints, not read/access grants.
-- A read begun after a hint remains authoritative even when a relationship-only
-- change leaves the source row unchanged. No global revision/silence barrier.
alter table public.discovery_feed_items add column discovery_hint_key uuid not null default gen_random_uuid();
alter table public.circle_spectator_feed_items add column discovery_hint_key uuid not null default gen_random_uuid();
alter table public.creator_events add column discovery_hint_key uuid not null default gen_random_uuid();
alter table public.titles add column party_count_hint_key uuid not null default gen_random_uuid();
alter table private.room_attendance_hint_receipts add column discovery_hint_key uuid not null default gen_random_uuid();
alter table private.discovery_invalidation_outbox add column hint_keys uuid[];
alter table private.discovery_invalidation_outbox add constraint discovery_hint_keys_bounded
  check(hint_keys is null or (cardinality(hint_keys) between 1 and 256 and array_position(hint_keys,null) is null));

create function private.guard_discovery_hint_key()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='titles' then
    new.party_count_hint_key:=case when tg_op='INSERT' then gen_random_uuid() else old.party_count_hint_key end;
  else
    new.discovery_hint_key:=case when tg_op='INSERT' then gen_random_uuid() else old.discovery_hint_key end;
  end if;
  return new;
end $$;
revoke all on function private.guard_discovery_hint_key() from public,anon,authenticated,service_role;
create trigger discovery_hint_key_guard before insert or update on public.discovery_feed_items
  for each row execute function private.guard_discovery_hint_key();
create trigger discovery_hint_key_guard before insert or update on public.circle_spectator_feed_items
  for each row execute function private.guard_discovery_hint_key();
create trigger discovery_hint_key_guard before insert or update on public.creator_events
  for each row execute function private.guard_discovery_hint_key();
create trigger party_count_hint_key_guard before insert or update on public.titles
  for each row execute function private.guard_discovery_hint_key();
create trigger attendance_hint_key_guard before insert or update on private.room_attendance_hint_receipts
  for each row execute function private.guard_discovery_hint_key();

create function private.discovery_projection_hint_keys(p_row public.discovery_feed_items)
returns uuid[] language sql stable security definer set search_path='' as $$
  select array_remove(array[p_row.discovery_hint_key,
    case when p_row.source_type='party_room' and p_row.metadata->>'content_source_type'='platform_title'
      then (select t.party_count_hint_key from public.titles t
        where t.id::text=lower(p_row.metadata->>'content_source_id')) end],null);
$$;
revoke all on function private.discovery_projection_hint_keys(public.discovery_feed_items) from public,anon,authenticated,service_role;

-- Most producers retain the exact source row while enqueuing. Public OLD/NEW
-- and deletion producers below supply their captured keys explicitly instead.
create function private.bind_discovery_invalidation_keys()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.hint_keys is not null then return new; end if;
  if new.source_table='discovery_feed_items' then
    select private.discovery_projection_hint_keys(d) into new.hint_keys from public.discovery_feed_items d where d.id=new.source_id;
  elsif new.source_table='circle_spectator_feed_items' then
    select array[d.discovery_hint_key] into new.hint_keys from public.circle_spectator_feed_items d where d.id=new.source_id;
  elsif new.source_table='creator_events' then
    select array[e.discovery_hint_key] into new.hint_keys from public.creator_events e where e.id=new.source_id;
  elsif new.source_table='notification_activity_events' then
    select array_agg(k) into new.hint_keys from (
      select distinct s.discovery_hint_key k from private.room_attendance_hint_receipts s
      join public.notification_activity_events e on e.id=new.source_id
      where s.party_id=e.source_id and s.recipient_user_id=e.recipient_user_id limit 257
    ) keys;
    if cardinality(new.hint_keys)>256 then new.hint_keys:=null; end if;
  end if;
  return new;
end $$;
revoke all on function private.bind_discovery_invalidation_keys() from public,anon,authenticated,service_role;
create trigger discovery_hint_keys_before_enqueue before insert on private.discovery_invalidation_outbox
  for each row execute function private.bind_discovery_invalidation_keys();

-- Counts return an authorized public-title footprint even when its count is
-- zero. No private title existence or private room source appears in this API.
alter function public.read_public_party_room_counts(text[]) rename to read_public_party_room_counts_pre_hint_keys;
revoke all on function public.read_public_party_room_counts_pre_hint_keys(text[]) from public,anon,authenticated,service_role;
create function public.read_public_party_room_counts(p_title_ids text[] default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; scopes jsonb;
begin
  result:=public.read_public_party_room_counts_pre_hint_keys(p_title_ids);
  if auth.uid() is null or public.is_account_access_restricted(auth.uid()::text)
    or not public.discovery_reader_session_current() then return result||'{"scopes":[]}'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('titleId',t.id,'key',t.party_count_hint_key) order by t.id),'[]') into scopes
    from public.titles t where t.id::text=any(p_title_ids)
      and t.is_published is true and lower(trim(coalesce(t.status,'')))='published'
      and (t.release_at is null or t.release_at<=now()) and (t.release_date is null or t.release_date<=now());
  return result||jsonb_build_object('scopes',scopes);
end $$;
revoke all on function public.read_public_party_room_counts(text[]) from public,anon,authenticated,service_role;
grant execute on function public.read_public_party_room_counts(text[]) to authenticated;

create function private.notification_discovery_hint_key(p_notification uuid,p_viewer uuid)
returns uuid language plpgsql stable security definer set search_path='' as $$
declare e public.notification_activity_events; r public.watch_party_rooms; result uuid; source_kind text;
begin
  if p_viewer is distinct from auth.uid() or not public.discovery_reader_session_current()
    or private.live_notification_read_context(p_notification,p_viewer)->>'allowed' is distinct from 'true' then return null; end if;
  select activity.* into e from public.notification_activity_events activity join public.notifications n on n.id=p_notification
    where n.user_id=p_viewer and n.source_type='notification_activity' and n.source_id=activity.id::text
      and activity.notification_id=n.id and activity.recipient_user_id=p_viewer;
  if e.event_kind='live_room_member_joined' then
    select discovery_hint_key into result from private.room_attendance_hint_receipts
      where notification_id=p_notification and event_id=e.id and recipient_user_id=p_viewer;
    return result;
  end if;
  source_kind:=case e.context->>'sourceType' when 'party_room' then 'party_room' when 'live_stage' then 'live_stage_room'
    when 'broadcast' then 'watch_party_room' end;
  if source_kind is null then return null; end if;
  select room.* into r from public.watch_party_rooms room where room.party_id=case
    when source_kind='watch_party_room' then (select coalesce(nullif(b.source_room_id,''),nullif(b.watch_party_room_id,''))
      from public.room_broadcast_sessions b where b.id=private.discovery_notification_uuid(e.source_id)) else e.source_id end;
  if r.discovery_visibility='public' then
    select d.discovery_hint_key into result from public.discovery_feed_items d
      where d.source_type=source_kind and d.source_id=case when source_kind='watch_party_room' then r.party_id else e.source_id end;
  elsif r.discovery_visibility='circle' then
    select d.discovery_hint_key into result from public.circle_spectator_feed_items d
      where d.source_type=source_kind and d.source_id=case when source_kind='watch_party_room' then r.party_id else e.source_id end;
  end if;
  return result;
end $$;
revoke all on function private.notification_discovery_hint_key(uuid,uuid) from public,anon,authenticated,service_role;
create or replace function private.enqueue_discovery_scope_invalidations()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_old text[] := array[]::text[];
  v_new text[] := array[]::text[];
  v_id uuid;
  v_revision text;
  v_keys uuid[]:=array[]::uuid[];
begin
  if tg_table_schema <> 'public' or tg_table_name <> 'discovery_feed_items' then
    raise exception 'discovery_invalidation_trigger_scope_invalid';
  end if;
  if not exists(select 1 from private.discovery_invalidation_worker_config where singleton and collecting) then return null; end if;
  if tg_op='UPDATE' and (to_jsonb(old)-'updated_at')=(to_jsonb(new)-'updated_at') then return null; end if;
  if tg_op <> 'INSERT' then v_old:=private.discovery_public_invalidation_scopes(old); v_id:=old.id; if cardinality(v_old)>0 then v_keys:=v_keys||private.discovery_projection_hint_keys(old); end if; end if;
  if tg_op <> 'DELETE' then v_new:=private.discovery_public_invalidation_scopes(new); v_id:=new.id; if cardinality(v_new)>0 then v_keys:=v_keys||private.discovery_projection_hint_keys(new); end if; end if;
  -- Preserve both OLD and NEW public title-count scopes on source changes.
  -- Keys are captured before deletion; no private-only source enters public topics.
  insert into private.discovery_invalidation_outbox(topic,source_id,hint_keys)
    select distinct topic,v_id,array(select distinct k from unnest(v_keys) k) from unnest(v_old||v_new) topic;
  if tg_op <> 'DELETE' and cardinality(v_new)>0 then
    v_revision:=md5((to_jsonb(new)-'updated_at')::text);
    insert into private.discovery_invalidation_outbox(topic,source_id,source_revision,due_at,available_at)
      select topic,v_id,v_revision,boundary,boundary
      from unnest(v_new) topic cross join (
        select distinct boundary from unnest(array[new.starts_at,new.ended_at]) boundary
        where boundary>clock_timestamp() and isfinite(boundary)
      ) deadlines;
  end if;
  return null;
end;
$$;

create or replace function private.enqueue_creator_event_scope_invalidations()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_old text[]:=array[]::text[];
  v_new text[]:=array[]::text[];
  v_id uuid;
  v_key uuid;
begin
  if tg_table_schema <> 'public' or tg_table_name <> 'creator_events' then
    raise exception 'event_invalidation_trigger_scope_invalid';
  end if;
  if not exists(select 1 from private.discovery_invalidation_worker_config where singleton and collecting) then return null; end if;
  if tg_op='UPDATE' and (to_jsonb(old)-'updated_at')=(to_jsonb(new)-'updated_at') then return null; end if;
  if tg_op <> 'INSERT' then
    v_id:=old.id; v_key:=old.discovery_hint_key;
    if old.visibility='public' and old.status<>'draft' then
      v_old:=array['discovery:v1:surface:home','discovery:v1:creator:'||old.host_user_id::text];
    end if;
  end if;
  if tg_op <> 'DELETE' then
    v_id:=new.id; v_key:=new.discovery_hint_key;
    if new.visibility='public' and new.status<>'draft' then
      v_new:=array['discovery:v1:surface:home','discovery:v1:creator:'||new.host_user_id::text];
    end if;
  end if;
  insert into private.discovery_invalidation_outbox(topic,source_id,source_table,hint_keys)
    select distinct topic,v_id,'creator_events',array[v_key] from unnest(v_old||v_new) topic;
  if tg_op <> 'DELETE' and cardinality(v_new)>0 then
    insert into private.discovery_invalidation_outbox(topic,source_id,source_table,source_revision,due_at,available_at)
      select topic,v_id,'creator_events',md5((to_jsonb(new)-'updated_at')::text),boundary,boundary
      from unnest(v_new) topic cross join (
        select distinct boundary from unnest(array[new.starts_at,new.ends_at]) boundary
        where boundary>clock_timestamp() and isfinite(boundary)
      ) deadlines;
  end if;
  return null;
end;
$$;

create or replace function private.deliver_discovery_primary_hint()
returns trigger language plpgsql security definer set search_path='' as $$
declare delivery uuid; before_send timestamp; after_send timestamp; confirmed boolean; v_payload jsonb;
begin
  if new.available_at>clock_timestamp() or new.status<>'pending' or not exists(
    select 1 from private.discovery_invalidation_worker_config
      where singleton and collecting and enabled and primary_delivery_enabled) then return null; end if;
  -- One opaque hint per topic/source per transaction. All writes are visible
  -- together at commit; the client reconciles canonical RLS, never this payload.
  if exists(select 1 from private.discovery_invalidation_outbox o where o.id<>new.id
    and o.source_transaction=new.source_transaction and o.topic=new.topic and o.source_table=new.source_table
    and o.source_id=new.source_id and o.hint_keys @> new.hint_keys and o.status='complete') then
    update private.discovery_invalidation_outbox set status='complete',completed_at=clock_timestamp() where id=new.id;
    return null;
  end if;
  begin
    delivery:=gen_random_uuid(); v_payload:=jsonb_build_object('id',delivery);
    if new.hint_keys is not null then v_payload:=v_payload||jsonb_build_object('keys',new.hint_keys); end if;
    before_send:=timezone('utc',clock_timestamp());
    perform realtime.send(v_payload,'discovery:invalidate',new.topic,true);
    after_send:=timezone('utc',clock_timestamp());
    -- Managed send can swallow errors. Verify the exact durable insertion;
    -- source commit and receipt insertion roll back together, never fake success.
    with candidates as materialized (
      select m.payload,m.event from realtime.messages m where extension='broadcast' and private is true
        and topic=new.topic and inserted_at>=before_send and inserted_at<=after_send
      order by inserted_at desc limit 1001
    ) select count(*)<=1000 and coalesce(bool_or(event='discovery:invalidate'
      and candidates.payload=v_payload),false) into confirmed from candidates;
    if not confirmed then raise exception 'discovery_primary_insert_unconfirmed'; end if;
    update private.discovery_invalidation_outbox set status='complete',completed_at=clock_timestamp(),last_error_code=null where id=new.id;
  exception when others then
    -- Failure is a durable pending retry, not a failed host privacy operation.
    -- The existing credentialed worker and bounded backoff remain the fallback.
    update private.discovery_invalidation_outbox set attempts=1,last_error_code=sqlstate where id=new.id;
  end;
  return null;
end $$;

create or replace function public.flush_discovery_invalidations(p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_ids bigint[];
  v_group record;
  v_completed integer:=0;
  v_failed integer:=0;
  v_superseded integer:=0;
  v_topics integer:=0;
  v_deferred integer:=0;
  v_next timestamptz;
  v_delivery_id uuid;
  v_before timestamp without time zone;
  v_after timestamp without time zone;
  v_confirmed boolean;
  v_payload jsonb;
  v_keys uuid[];
begin
  if p_limit is null or p_limit<1 or p_limit>100 then raise exception 'invalid_discovery_batch_limit'; end if;
  if not exists(select 1 from private.discovery_invalidation_worker_config where singleton and enabled) then
    return jsonb_build_object('enabled',false,'claimed',0,'completed',0,'failed',0,'superseded',0,'topics',0,'deferred',0);
  end if;
  -- Single-transaction ownership is the lease: crash/timeout rolls back both
  -- claims and sends. Other workers skip owned rows instead of waiting.
  select array_agg(id) into v_ids from (
    select id from private.discovery_invalidation_outbox
    where status='pending' and available_at<=statement_timestamp()
    order by available_at,id limit p_limit for update skip locked
  ) claimed;
  v_ids:=coalesce(v_ids,array[]::bigint[]);
  -- Time passing invalidates reads, never changes a source to "live". A changed
  -- or deleted source makes its obsolete deadline harmless.
  update private.discovery_invalidation_outbox o set status='superseded',completed_at=clock_timestamp()
    where o.id=any(v_ids) and o.source_revision is not null and not exists (
      select 1 from public.discovery_feed_items d where d.id=o.source_id
        and o.source_table='discovery_feed_items'
        and md5((to_jsonb(d)-'updated_at')::text)=o.source_revision
        and o.topic=any(private.discovery_public_invalidation_scopes(d))
      union all
      select 1 from public.creator_events e where e.id=o.source_id and o.source_table='creator_events'
        and md5((to_jsonb(e)-'updated_at')::text)=o.source_revision
        and e.visibility='public' and e.status<>'draft'
        and o.topic=any(array['discovery:v1:surface:home','discovery:v1:creator:'||e.host_user_id::text])
    );
  get diagnostics v_superseded=row_count;
  for v_group in select topic,array_agg(id) ids from private.discovery_invalidation_outbox
    where id=any(v_ids) and status='pending' group by topic order by topic
  loop
    -- Only dispatchers touch this per-scope gate. Source writes never contend
    -- on it. Hash collision can delay a scope, but cannot disclose or lose work.
    if not pg_catalog.pg_try_advisory_xact_lock(190729,pg_catalog.hashtext(v_group.topic)) then
      update private.discovery_invalidation_outbox set available_at=clock_timestamp()+interval '5 seconds'
        where id=any(v_group.ids);
      v_deferred:=v_deferred+cardinality(v_group.ids); continue;
    end if;
    select next_allowed_at into v_next from private.discovery_invalidation_scope_dispatch where topic=v_group.topic;
    if v_next>clock_timestamp() then
      update private.discovery_invalidation_outbox set available_at=v_next where id=any(v_group.ids);
      v_deferred:=v_deferred+cardinality(v_group.ids); continue;
    end if;
    begin
      -- The installed provider function returns void and SWALLOWS insert errors.
      -- It preserves a supplied payload id (its table-row id is independent).
      -- An opaque random delivery id enables exact confirmation, never authority.
      v_delivery_id:=gen_random_uuid();
      v_payload:=jsonb_build_object('id',v_delivery_id);
      if not exists(select 1 from private.discovery_invalidation_outbox where id=any(v_group.ids) and hint_keys is null) then
        select array_agg(k) into v_keys from (select distinct unnest(hint_keys) k
          from private.discovery_invalidation_outbox where id=any(v_group.ids) limit 257) keys;
        if cardinality(v_keys)<=256 then v_payload:=v_payload||jsonb_build_object('keys',v_keys); end if;
      end if;
      v_before:=timezone('utc',clock_timestamp());
      perform realtime.send(v_payload,'discovery:invalidate',v_group.topic,true);
      v_after:=timezone('utc',clock_timestamp());
      -- Actual managed partial index: (inserted_at DESC,topic) WHERE
      -- extension='broadcast' AND private IS TRUE. Bound candidate records BEFORE
      -- testing the payload. No three-day scan or provider schema modification.
      with candidates as materialized (
        select payload,event from realtime.messages
        where extension='broadcast' and private is true and topic=v_group.topic
          and inserted_at>=v_before and inserted_at<=v_after
        order by inserted_at desc limit 1001
      ) select count(*)<=1000 and coalesce(bool_or(event='discovery:invalidate'
          and payload=v_payload),false)
        into v_confirmed from candidates;
      if not v_confirmed then raise exception 'discovery_broadcast_insert_unconfirmed'; end if;
      update private.discovery_invalidation_outbox set status='complete',completed_at=clock_timestamp(),last_error_code=null
        where id=any(v_group.ids);
      insert into private.discovery_invalidation_scope_dispatch(topic,next_allowed_at)
        values(v_group.topic,clock_timestamp()+interval '5 seconds')
        on conflict(topic) do update set next_allowed_at=excluded.next_allowed_at;
      v_completed:=v_completed+cardinality(v_group.ids); v_topics:=v_topics+1;
    exception when others then
      -- The send and exact completion roll back together. Only sanitized SQLSTATE
      -- is retained; retries stay bounded and never fabricate delivery success.
      update private.discovery_invalidation_outbox set attempts=attempts+1,
        status=case when attempts+1>=8 then 'dead_letter' else 'pending' end,
        available_at=clock_timestamp()+make_interval(secs=>least(300,5*(2^attempts)::integer)),
        last_error_code=sqlstate
        where id=any(v_group.ids);
      v_failed:=v_failed+cardinality(v_group.ids);
    end;
  end loop;
  return jsonb_build_object('enabled',true,'claimed',cardinality(v_ids),'completed',v_completed,
    'failed',v_failed,'superseded',v_superseded,'topics',v_topics,'deferred',v_deferred);
end;
$$;
