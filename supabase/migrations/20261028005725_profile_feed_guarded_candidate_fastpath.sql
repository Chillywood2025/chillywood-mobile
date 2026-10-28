begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Safety boundary: callers retain all relationship RLS. This helper
-- exposes no capability beyond authenticated direct SELECT of creator_feed_items.
-- Unknown policy/ACL/role disables the optimization, never relaxes authorization.
create or replace function public.read_authorized_profile_feed_candidates(
  p_actors jsonb,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_snapshot_at timestamptz default null,
  p_limit integer default 20
)
returns table(id uuid,created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_viewer text;
  v_limit integer := greatest(1,least(50,coalesce(p_limit,20)));
  v_snapshot timestamptz := coalesce(p_snapshot_at,statement_timestamp());
  v_rows jsonb;
  v_acl boolean;
begin
  -- current_user is the definer, not the invoking role. PostgREST SET LOCAL ROLE
  -- must still be authenticated; service/custom roles use the invoker fallback.
  if current_setting('role',true) is distinct from 'authenticated'
    or coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','') <> 'authenticated' then
    return;
  end if;
  select has_schema_privilege('authenticated','public','USAGE')
    and has_schema_privilege('authenticated','auth','USAGE')
    and has_table_privilege('authenticated','public.creator_feed_items','SELECT')
    and has_function_privilege('authenticated','auth.uid()','EXECUTE')
    and has_function_privilege('authenticated','public.can_read_creator_feed_item(text,text,text,text,text,text,text)','EXECUTE')
    into v_acl;
  if v_acl is not true then return; end if;
  v_viewer:=auth.uid()::text;
  if v_viewer is null then return; end if;
  if (p_before_created_at is null)<>(p_before_id is null) or not isfinite(v_snapshot)
    or (p_before_created_at is not null and not isfinite(p_before_created_at)) then
    raise exception 'Invalid feed cursor.' using errcode='22023';
  end if;
  if p_actors is null then return; end if;
  if jsonb_typeof(p_actors)<>'array' then
    raise exception 'Invalid feed actor filters.' using errcode='22023';
  end if;
  -- Harmless SELECT takes the ordinary relation AccessShare lock before policy
  -- inspection. Native tests verify ALTER POLICY waits; REVOKE is not blocked.
  perform 1 from public.creator_feed_items where false;
  if not (select relrowsecurity from pg_class where oid='public.creator_feed_items'::regclass)
    or (select count(*) from pg_policy where polrelid='public.creator_feed_items'::regclass and polcmd in ('r','*'))<>1
    or not exists (
      select 1 from pg_policy policy where policy.polrelid='public.creator_feed_items'::regclass
        and policy.polcmd='r' and policy.polpermissive
        and policy.polroles=array['authenticated'::regrole]::oid[]
        and policy.polname='creator_feed_items_select_relationship_gated'
        and pg_get_expr(policy.polqual,policy.polrelid)=
          'public.can_read_creator_feed_item(source_type, source_id, creator_user_id, visibility, target_scope, status, (auth.uid())::text)'
    ) then return;
  end if;

  with actors as materialized (
    select distinct actor.actor_id,actor.target_scope
    from jsonb_to_recordset(p_actors) actor(actor_id text,target_scope text)
    where actor.actor_id is not null and actor.target_scope in ('followers','circle')
  ), raw_page as materialized (
    select candidate.* from actors actor cross join lateral (
      select item.id,item.created_at,item.source_type,item.source_id,item.creator_user_id,
        item.visibility,item.target_scope,item.status
      from public.creator_feed_items item
      where item.creator_user_id=actor.actor_id and item.target_scope=actor.target_scope
        and item.status='active' and item.created_at<=v_snapshot
        and (p_before_created_at is null or (item.created_at,item.id)<(p_before_created_at,p_before_id))
      order by item.created_at desc,item.id desc limit v_limit+1
    ) candidate order by candidate.created_at desc,candidate.id desc limit v_limit+1
  )
  select jsonb_agg(to_jsonb(raw_page) order by raw_page.created_at desc,raw_page.id desc)
    into v_rows from raw_page;

  if exists (
    select 1 from jsonb_to_recordset(coalesce(v_rows,'[]'::jsonb))
      candidate(source_type text,source_id text,creator_user_id text,visibility text,target_scope text,status text)
    where public.can_read_creator_feed_item(candidate.source_type,candidate.source_id,candidate.creator_user_id,
      candidate.visibility,candidate.target_scope,candidate.status,v_viewer) is not true
  ) then
    -- Do not expose a partial/filtered flag: on rejected raw candidates compute
    -- the complete authorized page internally, including older allowed rows.
    with actors as materialized (
      select distinct actor.actor_id,actor.target_scope
      from jsonb_to_recordset(p_actors) actor(actor_id text,target_scope text)
      where actor.actor_id is not null and actor.target_scope in ('followers','circle')
    ), authorized_page as materialized (
      select candidate.id,candidate.created_at from actors actor cross join lateral (
        select item.id,item.created_at from public.creator_feed_items item
        where item.creator_user_id=actor.actor_id and item.target_scope=actor.target_scope
          and item.status='active' and item.created_at<=v_snapshot
          and (p_before_created_at is null or (item.created_at,item.id)<(p_before_created_at,p_before_id))
          and public.can_read_creator_feed_item(item.source_type,item.source_id,item.creator_user_id,
            item.visibility,item.target_scope,item.status,v_viewer)
        order by item.created_at desc,item.id desc limit v_limit+1
      ) candidate order by candidate.created_at desc,candidate.id desc limit v_limit+1
    )
    select jsonb_agg(to_jsonb(authorized_page) order by authorized_page.created_at desc,authorized_page.id desc)
      into v_rows from authorized_page;
  end if;
  -- Match ordinary statement ACL semantics: an in-flight SELECT can finish
  -- after REVOKE. This additional recheck is conservative; future calls fail
  -- closed. No instant-revocation or stronger table locking is promised.
  if (has_schema_privilege('authenticated','public','USAGE')
    and has_schema_privilege('authenticated','auth','USAGE')
    and has_table_privilege('authenticated','public.creator_feed_items','SELECT')
    and has_function_privilege('authenticated','auth.uid()','EXECUTE')
    and has_function_privilege('authenticated','public.can_read_creator_feed_item(text,text,text,text,text,text,text)','EXECUTE')) is not true
    then return; end if;
  return query select candidate.id,candidate.created_at
    from jsonb_to_recordset(coalesce(v_rows,'[]'::jsonb)) candidate(id uuid,created_at timestamptz)
    order by candidate.created_at desc,candidate.id desc;
end;
$$;
revoke all on function public.read_authorized_profile_feed_candidates(jsonb,timestamptz,uuid,timestamptz,integer)
  from public,anon,service_role;
grant execute on function public.read_authorized_profile_feed_candidates(jsonb,timestamptz,uuid,timestamptz,integer)
  to authenticated;
comment on function public.read_authorized_profile_feed_candidates(jsonb,timestamptz,uuid,timestamptz,integer) is
  'Guarded bounded raw-candidate optimization: only complete canonical-authorized pages; no relationship reads or hidden-content status. Unknown direct-SELECT policy/ACL/role returns no rows for invoker fallback.';

create or replace function public.read_profile_relationship_feed_page(
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_snapshot_at timestamptz default null,
  p_limit integer default 20
)
returns table (
  id uuid,
  source_type text,
  source_id text,
  creator_user_id text,
  source_context text,
  created_at timestamptz,
  snapshot_at timestamptz
)
language plpgsql stable security invoker
set search_path = ''
as $$
declare
  v_actors jsonb;
  v_fast uuid[];
  v_authorized jsonb := '[]'::jsonb;
  v_candidate_id uuid;
  v_item record;
  v_viewer text := auth.uid()::text;
  v_limit integer := greatest(1, least(50, coalesce(p_limit, 20)));
  v_snapshot timestamptz := coalesce(p_snapshot_at, statement_timestamp());
begin
  if v_viewer is null then
    raise exception 'Sign in to read your feed.' using errcode = '42501';
  end if;
  if (p_before_created_at is null) <> (p_before_id is null)
    or not isfinite(v_snapshot)
    or (p_before_created_at is not null and not isfinite(p_before_created_at)) then
    raise exception 'Invalid feed cursor.' using errcode = '22023';
  end if;


  -- Relationship selection remains invoker-authorized; the helper receives
  -- filters only and never reads relationship tables or assigns context.
  with relationships as materialized (
    -- Read the caller's relationships, not every creator's feed rows. Existing
    -- low/high/follower indexes bound this by this viewer's graph, not all users.
    select v_viewer as actor_id, 0 as priority
    union all
    select f.user_high_id, 1 from public.user_friendships f
      where f.user_low_id = v_viewer and f.status = 'active'
    union all
    select f.user_low_id, 1 from public.user_friendships f
      where f.user_high_id = v_viewer and f.status = 'active'
    union all
    select f.channel_user_id, 2 from public.channel_followers f
      where f.follower_user_id = v_viewer
  ), actors as materialized (
    select r.actor_id, min(r.priority) as priority
      from relationships r group by r.actor_id
  )
  select jsonb_agg(jsonb_build_object('actor_id',a.actor_id,'priority',a.priority,
    'target_scope',case when a.priority=2 then 'followers' else 'circle' end))
    into v_actors from actors a;
  if current_user='authenticated' and has_function_privilege(current_user,
    'public.read_authorized_profile_feed_candidates(jsonb,timestamptz,uuid,timestamptz,integer)','EXECUTE') then
    select array_agg(candidate.id) into v_fast
      from public.read_authorized_profile_feed_candidates(v_actors,p_before_created_at,p_before_id,v_snapshot,v_limit) candidate;
  end if;
  if cardinality(v_fast)>0 then
    -- Equality lookups stay bounded under PostgreSQL generic plans. An ANY
    -- array can instead scan the complete active feed index before source RLS.
    -- Buffer every invoker-authorized row before returning any result; a missing
    -- row sends the complete request through the authoritative fallback.
    foreach v_candidate_id in array v_fast loop
      select item.id,item.source_type,item.source_id,item.creator_user_id,
        case actor.priority when 0 then 'own' when 1 then 'chilly_circle' else 'following' end as source_context,
        item.created_at
        into v_item
        from public.creator_feed_items item
        join jsonb_to_recordset(v_actors) as actor(actor_id text,priority integer,target_scope text)
          on actor.actor_id=item.creator_user_id and actor.target_scope=item.target_scope
        where item.id=v_candidate_id;
      if not found then exit; end if;
      v_authorized:=v_authorized||jsonb_build_array(to_jsonb(v_item));
    end loop;
    if jsonb_array_length(v_authorized)=cardinality(v_fast) then
      return query select item.id,item.source_type,item.source_id,item.creator_user_id,
        item.source_context,item.created_at,v_snapshot
        from jsonb_to_recordset(v_authorized) item(id uuid,source_type text,source_id text,
          creator_user_id text,source_context text,created_at timestamptz)
        order by item.created_at desc,item.id desc;
      return;
    end if;
  end if;
  -- Unknown policy/ACL/role or genuinely empty helper result: original invoker
  -- query remains authoritative. No hidden-content status crosses this seam.

  return query
  with relationships as materialized (
    -- Read the caller's relationships, not every creator's feed rows. Existing
    -- low/high/follower indexes bound this by this viewer's graph, not all users.
    select v_viewer as actor_id, 0 as priority
    union all
    select f.user_high_id, 1 from public.user_friendships f
      where f.user_low_id = v_viewer and f.status = 'active'
    union all
    select f.user_low_id, 1 from public.user_friendships f
      where f.user_high_id = v_viewer and f.status = 'active'
    union all
    select f.channel_user_id, 2 from public.channel_followers f
      where f.follower_user_id = v_viewer
  ), actors as materialized (
    select r.actor_id, min(r.priority) as priority
      from relationships r group by r.actor_id
  ), heads as materialized (
    select a.actor_id, a.priority, head.created_at, head.id
    from actors a
    cross join lateral (
      select item.created_at, item.id
      from public.creator_feed_items item
      where item.creator_user_id = a.actor_id and item.status = 'active'
        and item.target_scope = case when a.priority = 2 then 'followers' else 'circle' end
        and item.created_at <= v_snapshot
        and (p_before_created_at is null
          or (item.created_at, item.id) < (p_before_created_at, p_before_id))
      order by item.created_at desc, item.id desc
      limit 1
    ) head
  ), cutoff as materialized (
    -- K visible actor heads establish K distinct eligible rows. No row older
    -- than their Kth tuple can enter the global top K. If fewer heads exist,
    -- leave the cutoff absent so one prolific actor can still fill the page.
    select head.created_at, head.id from heads head
    order by head.created_at desc, head.id desc offset v_limit limit 1
  )
  select page.id, page.source_type, page.source_id, page.creator_user_id,
    case a.priority when 0 then 'own' when 1 then 'chilly_circle' else 'following' end,
    page.created_at, v_snapshot
  from heads a
  left join cutoff boundary on true
  cross join lateral (
    select item.id, item.source_type, item.source_id, item.creator_user_id, item.created_at
    from public.creator_feed_items item
    where item.creator_user_id = a.actor_id
      and item.status = 'active'
      -- Public posts/videos already have a Circle source row, and Circle-only
      -- videos have only that row. It is the canonical owner/Circle scope.
      -- One equality (not a scope OR) permits the creator/scope/time/id index.
      and item.target_scope = case when a.priority = 2 then 'followers' else 'circle' end
      and item.created_at <= v_snapshot
      and (p_before_created_at is null
        or (item.created_at, item.id) < (p_before_created_at, p_before_id))
      -- The minimum tuple is an unrestricted fallback, including -infinity
      -- timestamps. Avoid an OR so the real cutoff can be an index condition.
      and (item.created_at, item.id) >= (
        coalesce(boundary.created_at, '-infinity'::timestamptz),
        coalesce(boundary.id, '00000000-0000-0000-0000-000000000000'::uuid))
    order by item.created_at desc, item.id desc
    limit v_limit + 1
  ) page
  where boundary.id is null or (a.created_at, a.id) >= (boundary.created_at, boundary.id)
  order by page.created_at desc, page.id desc
  limit v_limit + 1;
end;
$$;
commit;
