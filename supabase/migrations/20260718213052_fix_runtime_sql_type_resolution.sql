-- The scan-aware creator-video reader superseded the seven-argument overload,
-- but the feed reader still called the legacy signature. Make the scan state
-- explicit, then remove the obsolete overload so PostgreSQL cannot select an
-- ambiguous default-argument candidate.

create or replace function public."can_read_creator_feed_item"(
  p_source_type text,
  p_source_id text,
  p_creator_user_id text,
  p_visibility text,
  p_target_scope text,
  p_status text,
  p_viewer_user_id text default (auth.uid())::text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_viewer_user_id text := (auth.uid())::text;
  v_creator_user_id text := nullif(btrim(coalesce(p_creator_user_id, '')), '');
  v_source_id text := nullif(btrim(coalesce(p_source_id, '')), '');
  v_video public."videos"%rowtype;
begin
  if v_creator_user_id is null or v_source_id is null then
    return false;
  end if;

  if v_viewer_user_id is not null and v_viewer_user_id = v_creator_user_id then
    return true;
  end if;

  if v_viewer_user_id is null then
    return false;
  end if;

  if coalesce(nullif(btrim(coalesce(p_status, '')), ''), 'active') <> 'active' then
    return false;
  end if;

  if public."is_creator_feed_viewer_blocked"(v_creator_user_id, v_viewer_user_id) then
    return false;
  end if;

  if coalesce(nullif(btrim(coalesce(p_source_type, '')), ''), '') = 'creator_video' then
    select *
    into v_video
    from public."videos"
    where "id"::text = v_source_id
      and "owner_id"::text = v_creator_user_id
    limit 1;

    if v_video."id" is null then
      return false;
    end if;

    if not public."can_read_creator_video_row"(
      v_video."owner_id"::text,
      v_video."visibility",
      v_video."moderation_status",
      v_video."scan_status",
      v_video."storage_path",
      v_video."storage_object_key",
      v_video."playback_url",
      v_viewer_user_id
    ) then
      return false;
    end if;

    if p_target_scope = 'followers'::text then
      return p_visibility = 'public'::text
        and v_video."visibility" = 'public'::text
        and exists (
          select 1
          from public."channel_followers" follower_row
          where follower_row."channel_user_id" = v_creator_user_id
            and follower_row."follower_user_id" = v_viewer_user_id
          limit 1
        );
    end if;

    if p_target_scope = 'circle'::text then
      return p_visibility in ('public'::text, 'circle'::text)
        and public."is_active_chilly_circle_member"(v_creator_user_id, v_viewer_user_id);
    end if;
  elsif coalesce(nullif(btrim(coalesce(p_source_type, '')), ''), '') = 'profile_post' then
    if not exists (
      select 1
      from public."profile_posts" post
      where post."id"::text = v_source_id
        and post."user_id" = v_creator_user_id
        and post."deleted_at" is null
        and post."visibility" = 'public'::text
        and post."moderation_status" in ('clean'::text, 'reported'::text)
        and public.can_view_profile_content(post."user_id")
      limit 1
    ) then
      return false;
    end if;

    if p_target_scope = 'followers'::text then
      return p_visibility = 'public'::text
        and exists (
          select 1
          from public."channel_followers" follower_row
          where follower_row."channel_user_id" = v_creator_user_id
            and follower_row."follower_user_id" = v_viewer_user_id
          limit 1
        );
    end if;

    if p_target_scope = 'circle'::text then
      return p_visibility = 'public'::text
        and public."is_active_chilly_circle_member"(v_creator_user_id, v_viewer_user_id);
    end if;
  end if;

  return false;
end;
$$;

drop function if exists public."can_read_creator_video_row"(text, text, text, text, text, text, text);

-- watch_party_rooms.host_user_id and auth.uid() are both UUIDs. The old text
-- cast made the whole OR expression fail to resolve at runtime. Patch the
-- deployed function definition deterministically while preserving its grants,
-- comments, sandbox gates, and Android-independent behavior.
do $$
declare
  v_definition text;
  v_bad_expression constant text := 'v_room."host_user_id" = v_user_id::text';
  v_fixed_expression constant text := 'v_room."host_user_id" = v_user_id';
begin
  select pg_get_functiondef(
    'public.create_ios_app_store_purchase_intent(text,text,uuid,jsonb)'::regprocedure
  ) into v_definition;

  if position(v_bad_expression in v_definition) = 0 then
    raise exception 'ios_purchase_intent_host_identity_expression_not_found';
  end if;

  execute replace(v_definition, v_bad_expression, v_fixed_expression);
end;
$$;

comment on function public."can_read_creator_feed_item"(text, text, text, text, text, text, text) is
  'Relationship-gated creator feed authorization using the scan-aware creator-video reader. Caller-supplied viewer identity cannot override auth.uid().';
