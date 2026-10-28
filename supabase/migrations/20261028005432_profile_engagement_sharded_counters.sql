-- Exact engagement read model. 64 independent rows avoid a single viral-post
-- write lock; reads touch at most 64 rows regardless of historical engagement.
-- Rollout: backfill locks source writers for this transaction. Review a measured
-- maintenance window before deployment; this is NOT an online migration claim.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
create schema if not exists profile_engagement_private;
revoke all on schema profile_engagement_private from public, anon, authenticated, service_role;
create table profile_engagement_private.post_counts (
  post_id uuid not null references public.profile_posts(id) on delete cascade,
  bucket smallint not null check (bucket between 0 and 63),
  like_count bigint not null default 0 check (like_count >= 0),
  comment_count bigint not null default 0 check (comment_count >= 0),
  primary key(post_id, bucket)
);
alter table profile_engagement_private.post_counts enable row level security;
alter table profile_engagement_private.post_counts force row level security;
revoke all on profile_engagement_private.post_counts from public, anon, authenticated, service_role;

create function profile_engagement_private.bucket(value text) returns smallint
language sql immutable strict security invoker set search_path = ''
-- MD5 is only a stable non-security partition key, not authentication. Unlike
-- PostgreSQL's internal hashtext algorithm it remains stable across upgrades.
as $$ select mod(pg_catalog.get_byte(pg_catalog.decode(pg_catalog.md5(value),'hex'),0),64)::smallint $$;
revoke all on function profile_engagement_private.bucket(text) from public, anon, authenticated, service_role;

create function profile_engagement_private.apply_delta(p_post uuid, p_bucket smallint, p_likes bigint, p_comments bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_likes = 0 and p_comments = 0 then return; end if;
  -- A parent cascade may already have removed counters; never recreate them.
  if not exists(select 1 from public.profile_posts where id = p_post) then return; end if;
  insert into profile_engagement_private.post_counts(post_id,bucket)
    values(p_post,p_bucket) on conflict do nothing;
  update profile_engagement_private.post_counts
    set like_count = like_count + p_likes, comment_count = comment_count + p_comments
    where post_id = p_post and bucket = p_bucket;
end;
$$;
revoke all on function profile_engagement_private.apply_delta(uuid,smallint,bigint,bigint) from public, anon, authenticated, service_role;

create function profile_engagement_private.track_like() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' and old.post_id = new.post_id and old.user_id = new.user_id then return new; end if;
  if TG_OP <> 'INSERT' then
    perform profile_engagement_private.apply_delta(old.post_id,profile_engagement_private.bucket(old.user_id),-1,0);
  end if;
  if TG_OP <> 'DELETE' then
    perform profile_engagement_private.apply_delta(new.post_id,profile_engagement_private.bucket(new.user_id),1,0);
    return new;
  end if;
  return old;
end;
$$;
create function profile_engagement_private.track_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare old_counted boolean := false; new_counted boolean := false;
begin
  if TG_OP <> 'INSERT' then old_counted := old.deleted_at is null and old.moderation_status in ('clean','reported'); end if;
  if TG_OP <> 'DELETE' then new_counted := new.deleted_at is null and new.moderation_status in ('clean','reported'); end if;
  if TG_OP = 'UPDATE' and old.post_id = new.post_id and old.id = new.id and old_counted = new_counted then return new; end if;
  if old_counted then perform profile_engagement_private.apply_delta(old.post_id,profile_engagement_private.bucket(old.id::text),0,-1); end if;
  if new_counted then perform profile_engagement_private.apply_delta(new.post_id,profile_engagement_private.bucket(new.id::text),0,1); end if;
  if TG_OP = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function profile_engagement_private.track_like() from public, anon, authenticated, service_role;
revoke all on function profile_engagement_private.track_comment() from public, anon, authenticated, service_role;

-- The write lock covers snapshot backfill AND trigger installation. No gap in
-- which a concurrent committed source change could be missed or counted twice.
lock table public.profile_post_likes, public.profile_post_comments in share row exclusive mode;
insert into profile_engagement_private.post_counts(post_id,bucket,like_count,comment_count)
select post_id,bucket,sum(likes),sum(comments) from (
  select post_id,profile_engagement_private.bucket(user_id) bucket,count(*) likes,0::bigint comments
  from public.profile_post_likes group by post_id,profile_engagement_private.bucket(user_id)
  union all
  select post_id,profile_engagement_private.bucket(id::text),0::bigint,count(*)
  from public.profile_post_comments where deleted_at is null and moderation_status in ('clean','reported')
  group by post_id,profile_engagement_private.bucket(id::text)
) counts group by post_id,bucket;
create trigger profile_post_likes_exact_count after insert or update or delete on public.profile_post_likes
  for each row execute function profile_engagement_private.track_like();
create trigger profile_post_comments_exact_count after insert or update or delete on public.profile_post_comments
  for each row execute function profile_engagement_private.track_comment();

-- Only this narrow reader is callable. The private table and mutation functions
-- remain inaccessible. Explicit source authorization is required even when the
-- helper is invoked directly rather than through the invoker batch function.
create function public.read_authorized_profile_post_counts(p_post_id uuid)
returns table(like_count bigint, comment_count bigint)
language sql stable security definer rows 1 set search_path = '' as $$
  select coalesce(sum(counts.like_count),0)::bigint,coalesce(sum(counts.comment_count),0)::bigint
  from public.profile_posts post
  left join profile_engagement_private.post_counts counts on counts.post_id = post.id
  where post.id = p_post_id and post.deleted_at is null and post.visibility = 'public'
    and post.moderation_status in ('clean','reported')
    and (
      public.can_view_profile_content(post.user_id)
      or (auth.uid() is not null and public.has_platform_role(array['owner','operator','moderator']::text[])
        and not public.is_platform_owner_user(post.user_id))
    )
  group by post.id
$$;
revoke all on function public.read_authorized_profile_post_counts(uuid) from public;
grant execute on function public.read_authorized_profile_post_counts(uuid) to anon, authenticated;

create or replace function public.read_profile_post_engagement_batch(p_post_ids uuid[])
returns table(post_id uuid,like_count bigint,comment_count bigint,liked_by_viewer boolean)
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_viewer text := auth.uid()::text;
  v_post uuid;
  v_likes bigint;
  v_comments bigint;
begin
  if coalesce(cardinality(p_post_ids),0) > 50 then
    raise exception 'Too many profile posts.' using errcode = '22023';
  end if;
  for v_post in
    select distinct requested.id from unnest(coalesce(p_post_ids,'{}'::uuid[])) requested(id)
    where requested.id is not null
  loop
    -- A generic ANY(array) plan may scan every public source and execute RLS
    -- for unrequested posts. Deduplicate at most 50 IDs first, then authorize
    -- each via its UUID equality lookup; source RLS still runs as the invoker.
    perform 1 from public.profile_posts post where post.id=v_post
      and post.deleted_at is null and post.visibility='public'
      and post.moderation_status in ('clean','reported');
    if not found then continue; end if;
    select counts.like_count,counts.comment_count into v_likes,v_comments
      from public.read_authorized_profile_post_counts(v_post) counts;
    if not found then
      -- Rare owner access with denied public child visibility (e.g. scheduled
      -- deletion) retains original invoker child RLS. A separate PL/pgSQL
      -- statement is prepared only here: an unused million-row COUNT estimate
      -- must not cause expensive JIT compilation on the normal bounded path.
      select (select count(*) from public.profile_post_likes likes where likes.post_id=v_post),
        (select count(*) from public.profile_post_comments comments where comments.post_id=v_post
          and comments.deleted_at is null and comments.moderation_status in ('clean','reported'))
        into v_likes,v_comments;
    end if;
    return query
      select v_post,v_likes,v_comments,
      exists(select 1 from public.profile_post_likes likes
        where likes.post_id = v_post and likes.user_id = v_viewer);
  end loop;
end;
$$;
revoke all on function public.read_profile_post_engagement_batch(uuid[]) from public;
grant execute on function public.read_profile_post_engagement_batch(uuid[]) to anon, authenticated;
comment on function public.read_profile_post_engagement_batch(uuid[]) is
  'At most 50 source-authorized public post exact engagement summaries. Invoker source RLS plus explicitly source-authorized private 64-shard totals; inaccessible posts omitted.';
commit;
