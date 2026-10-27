-- Read-only, source-level news feed. No copied per-recipient content, no policy
-- changes, and no privileged bypass of source/relationship/moderation RLS.
create or replace function public.preserve_creator_feed_cursor_identity()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.id := old.id;
  new.created_at := old.created_at;
  return new;
end;
$$;
revoke all on function public.preserve_creator_feed_cursor_identity() from public, anon, authenticated;
create trigger preserve_creator_feed_cursor_identity_before_update
  before update on public.creator_feed_items
  for each row execute function public.preserve_creator_feed_cursor_identity();

create index if not exists creator_feed_items_creator_scope_cursor_idx
  on public.creator_feed_items (creator_user_id, target_scope, created_at desc, id desc)
  where status = 'active';
create index if not exists profile_posts_owner_cursor_idx
  on public.profile_posts (user_id, created_at desc, id desc)
  where deleted_at is null and visibility = 'public' and moderation_status in ('clean', 'reported');
create index if not exists profile_post_comments_cursor_idx
  on public.profile_post_comments (post_id, created_at asc, id asc)
  where deleted_at is null and moderation_status in ('clean', 'reported');

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
  )
  select page.id, page.source_type, page.source_id, page.creator_user_id,
    case a.priority when 0 then 'own' when 1 then 'chilly_circle' else 'following' end,
    page.created_at, v_snapshot
  from actors a
  cross join lateral (
    select item.id, item.source_type, item.source_id, item.creator_user_id, item.created_at
    from public.creator_feed_items item
    where item.creator_user_id = a.actor_id
      and item.status = 'active'
      -- Public posts/videos already have a Circle source row, and Circle-only
      -- videos have only that row. It is the canonical owner/Circle scope.
      -- One equality (not a scope OR) keeps high-volume creator cursor reads
      -- on the full creator/scope/time/id index and avoids sorting their history.
      and item.target_scope = case when a.priority = 2 then 'followers' else 'circle' end
      and item.created_at <= v_snapshot
      and (p_before_created_at is null
        or (item.created_at, item.id) < (p_before_created_at, p_before_id))
    order by item.created_at desc, item.id desc
    limit v_limit + 1
  ) page
  order by page.created_at desc, page.id desc
  limit v_limit + 1;
end;
$$;

revoke all on function public.read_profile_relationship_feed_page(timestamptz, uuid, timestamptz, integer) from public, anon;
grant execute on function public.read_profile_relationship_feed_page(timestamptz, uuid, timestamptz, integer) to authenticated;
comment on function public.read_profile_relationship_feed_page(timestamptz, uuid, timestamptz, integer) is
  'Authenticated own/Circle/following feed, stable created_at+id keyset, at most limit+1 rows. Caller must preserve snapshot and deduplicate source_type/source_id across relationship changes. Invoker RLS remains authoritative; recommendations are a separate public discovery lane.';

create or replace function public.read_profile_post_engagement_batch(p_post_ids uuid[])
returns table (post_id uuid, like_count bigint, comment_count bigint, liked_by_viewer boolean)
language plpgsql stable security invoker set search_path = ''
as $$
begin
  if coalesce(cardinality(p_post_ids), 0) > 50 then
    raise exception 'Too many profile posts.' using errcode = '22023';
  end if;
  return query
    select post.id,
      (select count(*) from public.profile_post_likes likes where likes.post_id = post.id),
      (select count(*) from public.profile_post_comments comments
        where comments.post_id = post.id and comments.deleted_at is null
          and comments.moderation_status in ('clean', 'reported')),
      exists(select 1 from public.profile_post_likes likes
        where likes.post_id = post.id and likes.user_id = auth.uid()::text)
    from public.profile_posts post
    where post.id = any(coalesce(p_post_ids, '{}'::uuid[]))
      and post.deleted_at is null and post.visibility = 'public'
      and post.moderation_status in ('clean', 'reported');
end;
$$;
revoke all on function public.read_profile_post_engagement_batch(uuid[]) from public;
grant execute on function public.read_profile_post_engagement_batch(uuid[]) to anon, authenticated;
comment on function public.read_profile_post_engagement_batch(uuid[]) is
  'At most 50 source-authorized public post engagement summaries; RLS applies to source, likes and comments. Inaccessible posts are omitted, never represented by leaked counts.';
