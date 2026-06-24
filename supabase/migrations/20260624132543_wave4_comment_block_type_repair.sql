-- Repairs Wave 4 comment block checks so uuid owner ids are compared through
-- the text/text helper without changing comment throttles or visibility policy.

set check_function_bodies = false;

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
      and public."has_channel_audience_block_between"(new."user_id", video."owner_id"::text)
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
      and public."has_channel_audience_block_between"(new."user_id", post."user_id"::text)
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
