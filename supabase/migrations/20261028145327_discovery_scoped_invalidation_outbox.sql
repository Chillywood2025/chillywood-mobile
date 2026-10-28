begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Durable scoped hints, not content delivery or entitlement authority. No
-- scheduler, credentials, backfill or provider setting is activated here.
create table private.discovery_invalidation_worker_config (
  singleton boolean primary key default true check (singleton),
  collecting boolean not null default false,
  enabled boolean not null default false,
  token_sha256 text check (token_sha256 ~ '^[0-9a-f]{64}$'),
  check (not enabled or token_sha256 is not null)
);
insert into private.discovery_invalidation_worker_config(singleton) values (true);

create table private.discovery_invalidation_outbox (
  id bigint generated always as identity primary key,
  topic text not null check (topic ~ '^discovery:v1:(surface:(home|profile|channel)|creator:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'),
  source_id uuid not null,
  source_table text not null default 'discovery_feed_items' check (source_table in ('discovery_feed_items','creator_events')),
  source_revision text,
  due_at timestamptz not null default clock_timestamp(),
  available_at timestamptz not null default clock_timestamp(),
  status text not null default 'pending' check (status in ('pending','complete','superseded','dead_letter')),
  attempts integer not null default 0 check (attempts between 0 and 8),
  last_error_code text,
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  check (source_revision is null or source_revision ~ '^[0-9a-f]{32}$')
);
create index discovery_invalidation_ready_idx on private.discovery_invalidation_outbox(available_at,id) where status='pending';
create index discovery_invalidation_dead_idx on private.discovery_invalidation_outbox(created_at,id) where status='dead_letter';
create table private.discovery_invalidation_scope_dispatch (
  topic text primary key,
  next_allowed_at timestamptz not null
);
alter table private.discovery_invalidation_worker_config enable row level security;
alter table private.discovery_invalidation_worker_config force row level security;
alter table private.discovery_invalidation_outbox enable row level security;
alter table private.discovery_invalidation_outbox force row level security;
alter table private.discovery_invalidation_scope_dispatch enable row level security;
alter table private.discovery_invalidation_scope_dispatch force row level security;
revoke all on private.discovery_invalidation_worker_config, private.discovery_invalidation_outbox,
  private.discovery_invalidation_scope_dispatch from public, anon, authenticated, service_role;
revoke all on sequence private.discovery_invalidation_outbox_id_seq from public, anon, authenticated, service_role;

create function private.discovery_public_invalidation_scopes(p_row public.discovery_feed_items)
returns text[] language sql immutable set search_path='' as $$
  select coalesce(array_agg(distinct topic order by topic),array[]::text[]) from (
    select 'discovery:v1:surface:'||surface topic
      from unnest(case p_row.discovery_surface
        when 'home_profile_channel' then array['home','profile','channel']
        when 'home' then array['home'] when 'profile' then array['profile']
        when 'channel' then array['channel'] else array[]::text[] end) surface
    union all
    select 'discovery:v1:creator:'||lower(actor)
      from unnest(array[p_row.owner_user_id,p_row.channel_user_id]) actor
      where actor ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) scopes where p_row.is_publicly_discoverable and p_row.visibility='public'
    and p_row.moderation_status='clean' and p_row.discovery_surface <> 'none'
    and p_row.rights_status in ('creator_owned','chillywood_original','licensed_for_public_stream','metadata_only');
$$;
revoke all on function private.discovery_public_invalidation_scopes(public.discovery_feed_items) from public,anon,authenticated,service_role;

create function private.enqueue_discovery_scope_invalidations()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_old text[] := array[]::text[];
  v_new text[] := array[]::text[];
  v_id uuid;
  v_revision text;
begin
  if tg_table_schema <> 'public' or tg_table_name <> 'discovery_feed_items' then
    raise exception 'discovery_invalidation_trigger_scope_invalid';
  end if;
  if not exists(select 1 from private.discovery_invalidation_worker_config where singleton and collecting) then return null; end if;
  if tg_op='UPDATE' and (to_jsonb(old)-'updated_at')=(to_jsonb(new)-'updated_at') then return null; end if;
  if tg_op <> 'INSERT' then v_old:=private.discovery_public_invalidation_scopes(old); v_id:=old.id; end if;
  if tg_op <> 'DELETE' then v_new:=private.discovery_public_invalidation_scopes(new); v_id:=new.id; end if;
  -- Append-only in the source transaction: no shared revision row, follower
  -- fanout, scope lock or network send in the publisher's critical path.
  insert into private.discovery_invalidation_outbox(topic,source_id)
    select distinct topic,v_id from unnest(v_old||v_new) topic;
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
revoke all on function private.enqueue_discovery_scope_invalidations() from public,anon,authenticated,service_role;
create trigger discovery_scoped_invalidation_after_write after insert or update or delete
  on public.discovery_feed_items for each row execute function private.enqueue_discovery_scope_invalidations();

-- Upcoming events can outlive their scheduled discovery projection while the
-- host is late. Their canonical table therefore needs independent invalidation.
create function private.enqueue_creator_event_scope_invalidations()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_old text[]:=array[]::text[];
  v_new text[]:=array[]::text[];
  v_id uuid;
begin
  if tg_table_schema <> 'public' or tg_table_name <> 'creator_events' then
    raise exception 'event_invalidation_trigger_scope_invalid';
  end if;
  if not exists(select 1 from private.discovery_invalidation_worker_config where singleton and collecting) then return null; end if;
  if tg_op='UPDATE' and (to_jsonb(old)-'updated_at')=(to_jsonb(new)-'updated_at') then return null; end if;
  if tg_op <> 'INSERT' then
    v_id:=old.id;
    if old.visibility='public' and old.status<>'draft' then
      v_old:=array['discovery:v1:surface:home','discovery:v1:creator:'||old.host_user_id::text];
    end if;
  end if;
  if tg_op <> 'DELETE' then
    v_id:=new.id;
    if new.visibility='public' and new.status<>'draft' then
      v_new:=array['discovery:v1:surface:home','discovery:v1:creator:'||new.host_user_id::text];
    end if;
  end if;
  insert into private.discovery_invalidation_outbox(topic,source_id,source_table)
    select distinct topic,v_id,'creator_events' from unnest(v_old||v_new) topic;
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
revoke all on function private.enqueue_creator_event_scope_invalidations() from public,anon,authenticated,service_role;
create trigger creator_event_scoped_invalidation_after_write after insert or update or delete
  on public.creator_events for each row execute function private.enqueue_creator_event_scope_invalidations();

create function public.can_receive_discovery_invalidation(p_topic text)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(p_topic ~ '^discovery:v1:(surface:(home|profile|channel)|creator:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$',false)
    and (select auth.uid()) is not null
    and exists(select 1 from auth.users where id=(select auth.uid()) and not coalesce(is_anonymous,false))
    and not public.is_account_access_restricted((select auth.uid())::text);
$$;
revoke all on function public.can_receive_discovery_invalidation(text) from public,anon,service_role;
grant execute on function public.can_receive_discovery_invalidation(text) to authenticated;
-- Managed realtime.messages already has RLS; do not ALTER it. No client send
-- policy is added and existing room topic authorization is left untouched.
create policy discovery_scoped_invalidation_receive on realtime.messages
  for select to authenticated using (
    extension='broadcast' and topic=(select realtime.topic())
    and public.can_receive_discovery_invalidation((select realtime.topic()))
  );

create function public.authorize_discovery_invalidation_worker(p_token text)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(length(p_token) between 32 and 256 and exists (
    select 1 from private.discovery_invalidation_worker_config where singleton and enabled
      and token_sha256=encode(extensions.digest(p_token,'sha256'),'hex')
  ),false);
$$;
revoke all on function public.authorize_discovery_invalidation_worker(text) from public,anon,authenticated;
grant execute on function public.authorize_discovery_invalidation_worker(text) to service_role;

create function public.flush_discovery_invalidations(p_limit integer default 100)
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
      v_before:=timezone('utc',clock_timestamp());
      perform realtime.send(jsonb_build_object('id',v_delivery_id),'discovery:invalidate',v_group.topic,true);
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
          and payload=jsonb_build_object('id',v_delivery_id)),false)
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
revoke all on function public.flush_discovery_invalidations(integer) from public,anon,authenticated;
grant execute on function public.flush_discovery_invalidations(integer) to service_role;

create function public.read_discovery_invalidation_health()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'collecting',(select collecting from private.discovery_invalidation_worker_config where singleton),
    'enabled',(select enabled from private.discovery_invalidation_worker_config where singleton),
    'pendingSample', (select count(*) from (select 1 from private.discovery_invalidation_outbox where status='pending' order by available_at,id limit 10001) p),
    'deadLetterSample',(select count(*) from (select 1 from private.discovery_invalidation_outbox where status='dead_letter' order by created_at,id limit 10001) d),
    'oldestReadyAt',(select available_at from private.discovery_invalidation_outbox where status='pending' and available_at<=now() order by available_at,id limit 1),
    'sampleLimit',10001);
$$;
revoke all on function public.read_discovery_invalidation_health() from public,anon,authenticated;
grant execute on function public.read_discovery_invalidation_health() to service_role;

comment on table private.discovery_invalidation_outbox is
  'Private durable discovery invalidations; retained without automatic deletion. Operational activation must set worker credential, scope fanout budgets, monitoring and reviewed retention policy separately.';
commit;
