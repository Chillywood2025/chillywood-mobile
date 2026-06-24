-- Repairs Wave 4 trigger function bodies after deployment review.
-- Keeps abuse controls narrow: room creation throttles stay room-only, while
-- blocked-relationship checks live on comment write surfaces.

set check_function_bodies = false;

create or replace function public."enforce_watch_party_rooms_abuse_guard"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public."enforce_abuse_rate_limit"(
    new."host_user_id"::text,
    'watch_party_room_create',
    coalesce(new."room_type", 'unknown'),
    5,
    600,
    jsonb_build_object('source', 'watch_party_rooms')
  );
  return new;
end;
$$;

revoke all on function public."enforce_watch_party_rooms_abuse_guard"() from public;

create or replace function public."enforce_communication_rooms_abuse_guard"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public."enforce_abuse_rate_limit"(
    new."host_user_id",
    'communication_room_create',
    coalesce(new."linked_party_id", 'direct_call'),
    5,
    600,
    jsonb_build_object('source', 'communication_rooms')
  );
  return new;
end;
$$;

revoke all on function public."enforce_communication_rooms_abuse_guard"() from public;

create or replace function public."enforce_creator_video_comments_abuse_guard"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public."videos" video
    where video."id" = new."video_id"
      and public."has_channel_audience_block_between"(new."user_id", video."owner_id")
  ) then
    raise exception 'blocked_relationship';
  end if;

  perform public."enforce_abuse_rate_limit"(
    new."user_id",
    'creator_video_comment',
    new."video_id"::text,
    5,
    60,
    jsonb_build_object('source', 'creator_video_comments', 'parent_comment_id', new."parent_comment_id")
  );

  perform public."enforce_abuse_rate_limit"(
    new."user_id",
    'creator_video_comment_duplicate',
    new."video_id"::text || ':' || md5(btrim(coalesce(new."body", ''))),
    2,
    120,
    jsonb_build_object('source', 'creator_video_comments')
  );

  return new;
end;
$$;

revoke all on function public."enforce_creator_video_comments_abuse_guard"() from public;

create or replace function public."enforce_profile_post_comments_abuse_guard"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public."profile_posts" post
    where post."id" = new."post_id"
      and public."has_channel_audience_block_between"(new."user_id", post."user_id")
  ) then
    raise exception 'blocked_relationship';
  end if;

  perform public."enforce_abuse_rate_limit"(
    new."user_id",
    'profile_post_comment',
    new."post_id"::text,
    5,
    60,
    jsonb_build_object('source', 'profile_post_comments')
  );

  perform public."enforce_abuse_rate_limit"(
    new."user_id",
    'profile_post_comment_duplicate',
    new."post_id"::text || ':' || md5(btrim(coalesce(new."body", ''))),
    2,
    120,
    jsonb_build_object('source', 'profile_post_comments')
  );

  return new;
end;
$$;

revoke all on function public."enforce_profile_post_comments_abuse_guard"() from public;
