begin;

-- Existing rows remain revision zero until their first acknowledged versioned
-- mutation. A removed Saved title retains a private null-valued revision row.
create table private.user_collection_states (
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  collection text not null check (collection in ('saved','watch')),
  title_id text not null check (length(title_id) between 1 and 512),
  revision bigint not null check (revision > 0),
  value jsonb,
  updated_at timestamptz not null,
  primary key (actor_user_id, collection, title_id)
);
create table private.user_collection_operation_receipts (
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  request_payload jsonb not null,
  result_payload jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (actor_user_id, operation_id)
);
alter table private.user_collection_states enable row level security;
alter table private.user_collection_states force row level security;
alter table private.user_collection_operation_receipts enable row level security;
alter table private.user_collection_operation_receipts force row level security;
revoke all on private.user_collection_states, private.user_collection_operation_receipts
  from public, anon, authenticated, service_role;

create function private.assert_user_collection_session() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(public.whole_app_exact_current_session_authority_internal(), false)
    or not exists (
      select 1 from auth.sessions s
      where s.id::text = auth.jwt()->>'session_id' and s.user_id = auth.uid()
        and (s.not_after is null or s.not_after > clock_timestamp())
    ) then
    raise exception 'collection_current_session_required' using errcode = '42501';
  end if;
end $$;
revoke all on function private.assert_user_collection_session()
  from public, anon, authenticated, service_role;

create function private.user_collection_projection_value(p_actor uuid, p_collection text, p_title text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case p_collection
    when 'saved' then (
      select jsonb_build_object('id', l.title_id,
        'savedAt', floor(extract(epoch from l.updated_at) * 1000)::bigint)
      from public.user_list l where l.user_id = p_actor and l.title_id = p_title
    )
    when 'watch' then (
      select jsonb_strip_nulls(jsonb_build_object(
        'positionMillis', w.last_position_millis, 'durationMillis', w.duration_millis,
        'updatedAt', floor(extract(epoch from w.updated_at) * 1000)::bigint,
        'completed', w.completed, 'playCount', w.play_count))
      from public.watch_history w where w.user_id = p_actor and w.title_id = p_title
    ) end;
$$;
revoke all on function private.user_collection_projection_value(uuid,text,text)
  from public, anon, authenticated, service_role;

create function public.read_my_collection_state(
  p_collection text, p_after_title_id text default '', p_limit integer default 200
) returns table(title_id text, revision text, value jsonb)
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  perform private.assert_user_collection_session();
  if p_collection is null or p_collection not in ('saved','watch')
    or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'collection_read_invalid' using errcode = '22023';
  end if;
  return query
    select combined.item_title, combined.item_revision, combined.item_value
    from (
      select s.title_id as item_title, s.revision::text as item_revision, s.value as item_value
      from private.user_collection_states s
      where s.actor_user_id = actor and s.collection = p_collection
      union all
      select l.title_id, '0'::text,
        private.user_collection_projection_value(actor, 'saved', l.title_id)
      from public.user_list l
      where p_collection = 'saved' and l.user_id = actor
        and not exists (select 1 from private.user_collection_states s
          where s.actor_user_id = actor and s.collection = 'saved' and s.title_id = l.title_id)
      union all
      select w.title_id, '0'::text,
        private.user_collection_projection_value(actor, 'watch', w.title_id)
      from public.watch_history w
      where p_collection = 'watch' and w.user_id = actor
        and not exists (select 1 from private.user_collection_states s
          where s.actor_user_id = actor and s.collection = 'watch' and s.title_id = w.title_id)
    ) combined
    where combined.item_title > coalesce(p_after_title_id, '')
    order by combined.item_title limit p_limit;
  perform private.assert_user_collection_session();
end $$;

create function public.mutate_my_collection_state(
  p_collection text, p_title_id text, p_operation_id uuid,
  p_expected_revision text, p_value jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); expected bigint; current_revision bigint := 0;
  current_value jsonb; next_value jsonb; prior_request jsonb; prior_result jsonb;
  request jsonb; result jsonb; changed_at timestamptz; changed_millis bigint;
  position_value bigint; duration_value bigint; completed_value boolean;
  increment_count boolean := false; count_value integer;
begin
  perform private.assert_user_collection_session();
  -- A repeatable-read snapshot retained while waiting cannot revalidate a
  -- session revoked by another transaction. PostgREST uses read committed.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'collection_requires_read_committed' using errcode = '25000';
  end if;
  if p_collection is null or p_collection not in ('saved','watch')
    or p_title_id is null or length(p_title_id) not between 1 and 512
    or p_title_id in ('__proto__','prototype','constructor')
    or btrim(p_title_id) <> p_title_id or p_operation_id is null
    or p_expected_revision is null or p_expected_revision !~ '^(0|[1-9][0-9]{0,18})$' then
    raise exception 'collection_request_invalid' using errcode = '22023';
  end if;
  if p_expected_revision::numeric > 9223372036854775806 then
    raise exception 'collection_revision_invalid' using errcode = '22023';
  end if;
  expected := p_expected_revision::bigint;
  if pg_column_size(p_value) > 4096 then
    raise exception 'collection_value_too_large' using errcode = '22023';
  end if;
  if p_collection = 'saved' then
    if p_value is not null and (jsonb_typeof(p_value) <> 'object'
      or jsonb_typeof(p_value->'id') is distinct from 'string'
      or p_value->>'id' is distinct from p_title_id) then
      raise exception 'collection_saved_value_invalid' using errcode = '22023';
    end if;
    if p_value is not null and exists (
      select 1 from jsonb_object_keys(p_value) k where k <> 'id'
    ) then
      raise exception 'collection_saved_value_invalid' using errcode = '22023';
    end if;
  else
    if p_value is null or jsonb_typeof(p_value) <> 'object'
      or jsonb_typeof(p_value->'positionMillis') is distinct from 'number'
      or (p_value->>'positionMillis')::numeric < 0
      or (p_value->>'positionMillis')::numeric > 9007199254740991
      or (p_value->>'positionMillis')::numeric <> trunc((p_value->>'positionMillis')::numeric)
      or (p_value ? 'completed' and jsonb_typeof(p_value->'completed') is distinct from 'boolean')
      or (p_value ? 'incrementPlayCount' and jsonb_typeof(p_value->'incrementPlayCount') is distinct from 'boolean') then
      raise exception 'collection_watch_value_invalid' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_object_keys(p_value) k
      where k not in ('positionMillis','durationMillis','completed','incrementPlayCount')) then
      raise exception 'collection_watch_value_invalid' using errcode = '22023';
    end if;
    position_value := (p_value->>'positionMillis')::bigint;
    if p_value ? 'durationMillis' and p_value->'durationMillis' <> 'null'::jsonb then
      if jsonb_typeof(p_value->'durationMillis') <> 'number'
        or (p_value->>'durationMillis')::numeric < 0
        or (p_value->>'durationMillis')::numeric > 9007199254740991
        or (p_value->>'durationMillis')::numeric <> trunc((p_value->>'durationMillis')::numeric) then
        raise exception 'collection_watch_duration_invalid' using errcode = '22023';
      end if;
      duration_value := (p_value->>'durationMillis')::bigint;
    end if;
    completed_value := coalesce((p_value->>'completed')::boolean, false);
    increment_count := coalesce((p_value->>'incrementPlayCount')::boolean, false);
  end if;
  request := jsonb_build_object('collection', p_collection, 'titleId', p_title_id,
    'expectedRevision', p_expected_revision, 'value', p_value);
  -- The operation lock precedes the title lock everywhere, including key reuse
  -- across different titles. No concurrent duplicate can increment twice.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'user-collection-operation:' || actor::text || ':' || p_operation_id::text, 0));
  perform private.assert_user_collection_session();
  select r.request_payload, r.result_payload into prior_request, prior_result
  from private.user_collection_operation_receipts r
  where r.actor_user_id = actor and r.operation_id = p_operation_id;
  if found then
    if prior_request is distinct from request then
      raise exception 'collection_operation_key_conflict' using errcode = '22023';
    end if;
    return prior_result;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'user-collection-title:' || actor::text || ':' || p_collection || ':' || p_title_id, 0));
  perform private.assert_user_collection_session();
  select s.revision, s.value into current_revision, current_value
  from private.user_collection_states s
  where s.actor_user_id = actor and s.collection = p_collection and s.title_id = p_title_id
  for update;
  if not found then
    current_revision := 0;
    current_value := private.user_collection_projection_value(actor, p_collection, p_title_id);
  end if;
  if expected <> current_revision then
    result := jsonb_build_object('status', 'conflict', 'revision', current_revision::text, 'value', current_value);
  else
    changed_at := clock_timestamp();
    changed_millis := floor(extract(epoch from changed_at) * 1000)::bigint;
    if p_collection = 'saved' then
      if p_value is null then
        delete from public.user_list l where l.user_id = actor and l.title_id = p_title_id;
        next_value := null;
      else
        insert into public.user_list(user_id,title_id,updated_at) values(actor,p_title_id,changed_at)
        on conflict(user_id,title_id) do update set updated_at = excluded.updated_at;
        next_value := jsonb_build_object('id', p_title_id, 'savedAt', changed_millis);
      end if;
    else
      -- Existing progress-only inserts started at one. Preserve that behavior;
      -- only an accepted explicit start adds one to an existing title count.
      count_value := greatest(1, coalesce((current_value->>'playCount')::integer, 0)
        + case when increment_count then 1 else 0 end);
      next_value := jsonb_strip_nulls(jsonb_build_object(
        'positionMillis', position_value, 'durationMillis', duration_value,
        'updatedAt', changed_millis, 'completed', completed_value, 'playCount', count_value));
      insert into public.watch_history(user_id,title_id,last_position_millis,duration_millis,
        completed,last_watched_at,updated_at,play_count)
      values(actor,p_title_id,position_value,duration_value,completed_value,changed_at,changed_at,count_value)
      on conflict(user_id,title_id) do update set
        last_position_millis = excluded.last_position_millis, duration_millis = excluded.duration_millis,
        completed = excluded.completed, last_watched_at = excluded.last_watched_at,
        updated_at = excluded.updated_at, play_count = excluded.play_count;
    end if;
    current_revision := current_revision + 1;
    insert into private.user_collection_states(actor_user_id,collection,title_id,revision,value,updated_at)
    values(actor,p_collection,p_title_id,current_revision,next_value,changed_at)
    on conflict(actor_user_id,collection,title_id) do update set
      revision = excluded.revision, value = excluded.value, updated_at = excluded.updated_at;
    result := jsonb_build_object('status', 'applied', 'revision', current_revision::text, 'value', next_value);
  end if;
  insert into private.user_collection_operation_receipts(actor_user_id,operation_id,request_payload,result_payload)
  values(actor,p_operation_id,request,result);
  perform private.assert_user_collection_session();
  return result;
end $$;

revoke all on function public.read_my_collection_state(text,text,integer),
  public.mutate_my_collection_state(text,text,uuid,text,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.read_my_collection_state(text,text,integer),
  public.mutate_my_collection_state(text,text,uuid,text,jsonb) to authenticated;

-- Old app/direct writes lack both a revision and an operation identity. They
-- must fail closed at this cutover; existing owner SELECT policies are retained.
revoke insert, update, delete, truncate, references, trigger
  on public.user_list, public.watch_history from public, anon, authenticated;

commit;
