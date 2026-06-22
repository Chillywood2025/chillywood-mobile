-- Back creator-video Chi'lly Circle visibility with the existing Chi'lly Circle
-- relationship source of truth: active rows in user_friendships.

update public."videos"
set "visibility" = 'draft'
where coalesce(nullif("visibility", ''), 'draft') not in ('draft', 'circle', 'public');

alter table public."videos"
  drop constraint if exists "videos_visibility_check";

alter table public."videos"
  add constraint "videos_visibility_check"
  check ("visibility" in ('draft'::text, 'circle'::text, 'public'::text));

create index if not exists "videos_visibility_moderation_created_idx"
  on public."videos" ("visibility", "moderation_status", "created_at" desc);

create or replace function public."is_creator_video_playable_source"(
  p_storage_path text,
  p_storage_object_key text,
  p_playback_url text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(p_storage_path), ''), nullif(btrim(p_storage_object_key), ''), nullif(btrim(p_playback_url), '')) is not null;
$$;

revoke all on function public."is_creator_video_playable_source"(text, text, text) from public;
grant execute on function public."is_creator_video_playable_source"(text, text, text) to anon, authenticated, postgres, service_role;

create or replace function public."is_creator_video_viewer_blocked"(
  p_owner_user_id text,
  p_viewer_user_id text default (auth.uid())::text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when nullif(btrim(coalesce(p_owner_user_id, '')), '') is null
      or (auth.uid())::text is null
      or nullif(btrim(coalesce(p_owner_user_id, '')), '') = (auth.uid())::text
      then false
    else exists (
      select 1
      from public."channel_audience_blocks" block_row
      where (
        block_row."channel_user_id" = nullif(btrim(coalesce(p_owner_user_id, '')), '')
        and block_row."blocked_user_id" = (auth.uid())::text
      ) or (
        block_row."channel_user_id" = (auth.uid())::text
        and block_row."blocked_user_id" = nullif(btrim(coalesce(p_owner_user_id, '')), '')
      )
      limit 1
    )
  end;
$$;

revoke all on function public."is_creator_video_viewer_blocked"(text, text) from public;
grant execute on function public."is_creator_video_viewer_blocked"(text, text) to anon, authenticated, postgres, service_role;

create or replace function public."is_active_chilly_circle_member"(
  p_creator_user_id text,
  p_member_user_id text default (auth.uid())::text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with normalized as (
    select
      nullif(btrim(coalesce(p_creator_user_id, '')), '') as creator_user_id,
      (auth.uid())::text as member_user_id
  )
  select exists (
    select 1
    from public."user_friendships" friendship_row
    join normalized on true
    where normalized.creator_user_id is not null
      and normalized.member_user_id is not null
      and normalized.creator_user_id <> normalized.member_user_id
      and friendship_row."user_low_id" = least(normalized.creator_user_id, normalized.member_user_id)
      and friendship_row."user_high_id" = greatest(normalized.creator_user_id, normalized.member_user_id)
      and friendship_row."status" = 'active'::text
    limit 1
  );
$$;

revoke all on function public."is_active_chilly_circle_member"(text, text) from public;
grant execute on function public."is_active_chilly_circle_member"(text, text) to authenticated, postgres, service_role;

create or replace function public."can_read_creator_video_row"(
  p_owner_user_id text,
  p_visibility text,
  p_moderation_status text,
  p_storage_path text,
  p_storage_object_key text,
  p_playback_url text,
  p_viewer_user_id text default (auth.uid())::text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with normalized as (
    select
      nullif(btrim(coalesce(p_owner_user_id, '')), '') as owner_user_id,
      (auth.uid())::text as viewer_user_id,
      coalesce(nullif(btrim(coalesce(p_visibility, '')), ''), 'draft') as visibility,
      coalesce(nullif(btrim(coalesce(p_moderation_status, '')), ''), 'clean') as moderation_status
  )
  select case
    when normalized.owner_user_id is null then false
    when normalized.viewer_user_id is not null and normalized.viewer_user_id = normalized.owner_user_id then true
    when normalized.moderation_status not in ('clean'::text, 'reported'::text) then false
    when not public."is_creator_video_playable_source"(p_storage_path, p_storage_object_key, p_playback_url) then false
    when normalized.viewer_user_id is not null
      and public."is_creator_video_viewer_blocked"(normalized.owner_user_id, normalized.viewer_user_id)
      then false
    when normalized.visibility = 'public'::text then true
    when normalized.visibility = 'circle'::text
      and normalized.viewer_user_id is not null
      and public."is_active_chilly_circle_member"(normalized.owner_user_id, normalized.viewer_user_id)
      then true
    else false
  end
  from normalized;
$$;

revoke all on function public."can_read_creator_video_row"(text, text, text, text, text, text, text) from public;
grant execute on function public."can_read_creator_video_row"(text, text, text, text, text, text, text) to anon, authenticated, postgres, service_role;

drop policy if exists "Public videos readable" on public."videos";
drop policy if exists "videos_select_public_or_owner" on public."videos";
drop policy if exists "videos_select_visibility_access" on public."videos";
create policy "videos_select_visibility_access"
  on public."videos"
  for select
  to public
  using (
    public."can_read_creator_video_row"(
      "owner_id"::text,
      "visibility",
      "moderation_status",
      "storage_path",
      "storage_object_key",
      "playback_url",
      (auth.uid())::text
    )
  );

drop policy if exists "Users can update own videos" on public."videos";
create policy "Users can update own videos"
  on public."videos"
  for update
  to public
  using ((auth.uid() is not null) and ("owner_id" = auth.uid()))
  with check ((auth.uid() is not null) and ("owner_id" = auth.uid()));

drop policy if exists "Users can delete own videos" on public."videos";
create policy "Users can delete own videos"
  on public."videos"
  for delete
  to public
  using ((auth.uid() is not null) and ("owner_id" = auth.uid()));

create or replace function public."resolve_creator_video_visibility_access"(
  p_video_id text,
  p_viewer_user_id text default (auth.uid())::text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_video_id text := nullif(btrim(coalesce(p_video_id, '')), '');
  v_auth_user_id text := (auth.uid())::text;
  v_viewer_user_id text := null;
  v_video public."videos"%rowtype;
  v_owner_user_id text := null;
  v_visibility text := 'draft';
  v_is_owner boolean := false;
  v_is_blocked boolean := false;
  v_is_circle_member boolean := false;
  v_has_playable_source boolean := false;
  v_allowed boolean := false;
  v_reason text := 'not_found';
begin
  v_viewer_user_id := v_auth_user_id;

  if v_video_id is null then
    return jsonb_build_object(
      'allowed', false,
      'visibility', v_visibility,
      'reason', 'not_found',
      'is_owner', false,
      'is_blocked', false,
      'is_circle_member', false,
      'has_playable_source', false,
      'viewer_user_id', v_viewer_user_id,
      'owner_user_id', null
    );
  end if;

  select *
  into v_video
  from public."videos"
  where "id"::text = v_video_id
  limit 1;

  if v_video."id" is null then
    return jsonb_build_object(
      'allowed', false,
      'visibility', v_visibility,
      'reason', 'not_found',
      'is_owner', false,
      'is_blocked', false,
      'is_circle_member', false,
      'has_playable_source', false,
      'viewer_user_id', v_viewer_user_id,
      'owner_user_id', null
    );
  end if;

  v_owner_user_id := v_video."owner_id"::text;
  v_visibility := coalesce(nullif(v_video."visibility", ''), 'draft');
  if v_visibility not in ('draft', 'circle', 'public') then
    v_visibility := 'draft';
  end if;
  v_is_owner := v_viewer_user_id is not null and v_viewer_user_id = v_owner_user_id;
  v_has_playable_source := public."is_creator_video_playable_source"(v_video."storage_path", v_video."storage_object_key", v_video."playback_url");

  if v_viewer_user_id is not null and not v_is_owner then
    v_is_blocked := public."is_creator_video_viewer_blocked"(v_owner_user_id, v_viewer_user_id);
    v_is_circle_member := public."is_active_chilly_circle_member"(v_owner_user_id, v_viewer_user_id);
  end if;

  if v_is_blocked then
    v_reason := 'blocked';
  elsif v_is_owner then
    v_allowed := true;
    v_reason := 'owner_allowed';
  elsif v_video."moderation_status" not in ('clean'::text, 'reported'::text) then
    v_reason := 'moderation_unavailable';
  elsif not v_has_playable_source then
    v_reason := 'media_unavailable';
  elsif v_visibility = 'public'::text then
    v_allowed := true;
    v_reason := 'public_allowed';
  elsif v_visibility = 'circle'::text and v_is_circle_member then
    v_allowed := true;
    v_reason := 'circle_member_allowed';
  elsif v_visibility = 'circle'::text then
    v_reason := case when v_viewer_user_id is null then 'signed_out_requires_circle' else 'circle_member_required' end;
  elsif v_visibility = 'draft'::text then
    v_reason := 'draft_owner_only';
  else
    v_reason := 'unavailable';
  end if;

  return jsonb_build_object(
    'allowed', v_allowed,
    'visibility', v_visibility,
    'reason', v_reason,
    'is_owner', v_is_owner,
    'is_blocked', v_is_blocked,
    'is_circle_member', v_is_circle_member,
    'has_playable_source', v_has_playable_source,
    'viewer_user_id', v_viewer_user_id,
    'owner_user_id', v_owner_user_id
  );
end;
$$;

revoke all on function public."resolve_creator_video_visibility_access"(text, text) from public;
grant execute on function public."resolve_creator_video_visibility_access"(text, text) to anon, authenticated, postgres, service_role;

drop policy if exists "creator_videos_storage_select_public_or_owner" on storage.objects;
drop policy if exists "creator_videos_storage_select_visibility_access" on storage.objects;
create policy "creator_videos_storage_select_visibility_access"
  on storage.objects
  for select
  to public
  using (
    bucket_id = 'creator-videos'
    and (
      ((auth.uid() is not null) and ((storage.foldername(name))[1] = (auth.uid())::text))
      or exists (
        select 1
        from public."videos" video
        where (
          video."storage_path" = storage.objects.name
          or video."storage_object_key" = storage.objects.name
          or video."thumb_storage_path" = storage.objects.name
          or video."playback_url" = storage.objects.name
        )
        and public."can_read_creator_video_row"(
          video."owner_id"::text,
          video."visibility",
          video."moderation_status",
          video."storage_path",
          video."storage_object_key",
          video."playback_url",
          (auth.uid())::text
        )
      )
    )
  );

comment on function public."resolve_creator_video_visibility_access"(text, text) is
  'Safely resolves creator-video draft/circle/public access. Draft is owner-only. Circle uses active Chi''lly Circle membership and channel blocks; followers do not unlock Circle-private videos.';

comment on function public."can_read_creator_video_row"(text, text, text, text, text, text, text) is
  'RLS helper for creator videos. Public requires public visibility, safe moderation, playable media, and no channel block. Circle requires active Chi''lly Circle membership.';
