-- Relationship feed fan-out for creator-owned content.
-- Source-level rows are relationship-gated at read time; this intentionally
-- avoids per-user copied rows and never posts creator content to every Profile.

update public."profile_posts"
set
  "deleted_at" = coalesce("deleted_at", timezone('utc'::text, now())),
  "moderation_status" = case
    when "moderation_status" in ('hidden'::text, 'removed'::text) then "moderation_status"
    else 'hidden'::text
  end,
  "updated_at" = timezone('utc'::text, now())
where "visibility" = 'draft'::text;

drop policy if exists "profile_posts_insert_own_clean" on public."profile_posts";
create policy "profile_posts_insert_own_clean"
  on public."profile_posts"
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and "user_id" = (auth.uid())::text
    and "visibility" = 'public'::text
    and "moderation_status" = 'clean'::text
    and "deleted_at" is null
  );

create or replace function public."admin_create_official_rachi_post"(
  p_body text,
  p_visibility text default 'public',
  p_reason text default 'Official Rachi update'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
  safe_body text := nullif(trim(coalesce(p_body, '')), '');
  safe_reason text := nullif(trim(coalesce(p_reason, '')), '');
  created_post public."profile_posts"%rowtype;
  audit_id uuid;
begin
  actor_role := public."admin_content_assert_operator"();

  if safe_body is null then
    raise exception 'rachi_post_body_required';
  end if;

  if char_length(safe_body) > 500 then
    raise exception 'rachi_post_body_too_long';
  end if;

  safe_reason := coalesce(safe_reason, 'Official Rachi update');

  insert into public."profile_posts" (
    "user_id",
    "body",
    "visibility",
    "moderation_status",
    "updated_at"
  )
  values (
    'platform_rachi_official',
    safe_body,
    'public',
    'clean',
    timezone('utc'::text, now())
  )
  returning * into created_post;

  audit_id := public."admin_content_write_audit"(
    'official_rachi_post_created',
    'profile_post',
    created_post."id"::text,
    safe_reason,
    null,
    to_jsonb(created_post),
    jsonb_build_object(
      'official_account_id', 'platform_rachi_official',
      'rachi_official_account', true,
      'surface', 'admin_rachi_tab',
      'visibility', 'public',
      'profile_post_draft_state', 'not_supported'
    ),
    'platform_rachi_official',
    'notice'
  );

  return jsonb_build_object(
    'id', created_post."id",
    'userId', created_post."user_id",
    'body', created_post."body",
    'visibility', created_post."visibility",
    'moderationStatus', created_post."moderation_status",
    'moderationReason', created_post."moderation_reason",
    'moderatedAt', created_post."moderated_at",
    'moderatedBy', created_post."moderated_by",
    'createdAt', created_post."created_at",
    'updatedAt', created_post."updated_at",
    'auditId', audit_id,
    'actorRole', actor_role
  );
end;
$$;

revoke all on function public."admin_create_official_rachi_post"(text, text, text) from public;
grant execute on function public."admin_create_official_rachi_post"(text, text, text) to authenticated;

create table if not exists public."creator_feed_items" (
  "id" uuid primary key default gen_random_uuid(),
  "source_type" text not null,
  "source_id" text not null,
  "creator_user_id" text not null,
  "visibility" text not null,
  "target_scope" text not null,
  "published_at" timestamp with time zone not null default timezone('utc'::text, now()),
  "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
  "updated_at" timestamp with time zone not null default timezone('utc'::text, now()),
  "status" text not null default 'active'::text,
  "ranking_score" numeric not null default 0,
  "metadata" jsonb not null default '{}'::jsonb
);

alter table public."creator_feed_items"
  drop constraint if exists "creator_feed_items_source_type_check";
alter table public."creator_feed_items"
  add constraint "creator_feed_items_source_type_check"
  check ("source_type" in ('creator_video'::text, 'profile_post'::text));

alter table public."creator_feed_items"
  drop constraint if exists "creator_feed_items_visibility_check";
alter table public."creator_feed_items"
  add constraint "creator_feed_items_visibility_check"
  check ("visibility" in ('public'::text, 'circle'::text));

alter table public."creator_feed_items"
  drop constraint if exists "creator_feed_items_target_scope_check";
alter table public."creator_feed_items"
  add constraint "creator_feed_items_target_scope_check"
  check ("target_scope" in ('followers'::text, 'circle'::text));

alter table public."creator_feed_items"
  drop constraint if exists "creator_feed_items_status_check";
alter table public."creator_feed_items"
  add constraint "creator_feed_items_status_check"
  check ("status" in ('active'::text, 'removed'::text, 'hidden'::text));

create unique index if not exists "creator_feed_items_source_scope_unique"
  on public."creator_feed_items" ("source_type", "source_id", "target_scope");

create index if not exists "creator_feed_items_scope_status_published_idx"
  on public."creator_feed_items" ("target_scope", "status", "published_at" desc);

create index if not exists "creator_feed_items_creator_status_published_idx"
  on public."creator_feed_items" ("creator_user_id", "status", "published_at" desc);

alter table public."creator_feed_items" enable row level security;

create or replace function public."is_creator_feed_viewer_blocked"(
  p_creator_user_id text,
  p_viewer_user_id text default (auth.uid())::text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when nullif(btrim(coalesce(p_creator_user_id, '')), '') is null
      or (auth.uid())::text is null
      or nullif(btrim(coalesce(p_creator_user_id, '')), '') = (auth.uid())::text
      then false
    else exists (
      select 1
      from public."channel_audience_blocks" block_row
      where (
        block_row."channel_user_id" = nullif(btrim(coalesce(p_creator_user_id, '')), '')
        and block_row."blocked_user_id" = (auth.uid())::text
      ) or (
        block_row."channel_user_id" = (auth.uid())::text
        and block_row."blocked_user_id" = nullif(btrim(coalesce(p_creator_user_id, '')), '')
      )
      limit 1
    )
  end;
$$;

revoke all on function public."is_creator_feed_viewer_blocked"(text, text) from public;
grant execute on function public."is_creator_feed_viewer_blocked"(text, text) to anon, authenticated, postgres, service_role;

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

revoke all on function public."can_read_creator_feed_item"(text, text, text, text, text, text, text) from public;
grant execute on function public."can_read_creator_feed_item"(text, text, text, text, text, text, text) to anon, authenticated, postgres, service_role;

drop policy if exists "creator_feed_items_select_relationship_gated" on public."creator_feed_items";
create policy "creator_feed_items_select_relationship_gated"
  on public."creator_feed_items"
  for select
  to authenticated
  using (
    public."can_read_creator_feed_item"(
      "source_type",
      "source_id",
      "creator_user_id",
      "visibility",
      "target_scope",
      "status",
      (auth.uid())::text
    )
  );

drop policy if exists "creator_feed_items_insert_owner" on public."creator_feed_items";
create policy "creator_feed_items_insert_owner"
  on public."creator_feed_items"
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and "creator_user_id" = (auth.uid())::text
    and (
      (
        "source_type" = 'creator_video'::text
        and exists (
          select 1
          from public."videos" video
          where video."id"::text = "source_id"
            and video."owner_id" = auth.uid()
            and video."visibility" in ('public'::text, 'circle'::text)
            and video."moderation_status" in ('clean'::text, 'reported'::text)
        )
      )
      or (
        "source_type" = 'profile_post'::text
        and exists (
          select 1
          from public."profile_posts" post
          where post."id"::text = "source_id"
            and post."user_id" = (auth.uid())::text
            and post."deleted_at" is null
            and post."visibility" = 'public'::text
            and post."moderation_status" in ('clean'::text, 'reported'::text)
        )
      )
    )
    and (
      ("target_scope" = 'followers'::text and "visibility" = 'public'::text)
      or ("target_scope" = 'circle'::text and "visibility" in ('public'::text, 'circle'::text))
    )
  );

drop policy if exists "creator_feed_items_update_owner" on public."creator_feed_items";
create policy "creator_feed_items_update_owner"
  on public."creator_feed_items"
  for update
  to authenticated
  using (auth.uid() is not null and "creator_user_id" = (auth.uid())::text)
  with check (auth.uid() is not null and "creator_user_id" = (auth.uid())::text);

drop policy if exists "creator_feed_items_delete_owner" on public."creator_feed_items";
create policy "creator_feed_items_delete_owner"
  on public."creator_feed_items"
  for delete
  to authenticated
  using (auth.uid() is not null and "creator_user_id" = (auth.uid())::text);

create or replace function public."sync_creator_video_feed_items"(
  p_video_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_video public."videos"%rowtype;
  v_visibility text := 'draft';
  v_is_feed_safe boolean := false;
  v_now timestamp with time zone := timezone('utc'::text, now());
  v_active_followers boolean := false;
  v_active_circle boolean := false;
begin
  if v_auth_user_id is null then
    raise exception 'Sign in before syncing creator feed items.';
  end if;

  select *
  into v_video
  from public."videos"
  where "id"::text = nullif(btrim(coalesce(p_video_id, '')), '')
  limit 1;

  if v_video."id" is null then
    raise exception 'Creator video not found.';
  end if;

  if v_video."owner_id" <> v_auth_user_id then
    raise exception 'Only the creator can sync feed items for this video.';
  end if;

  v_visibility := coalesce(nullif(v_video."visibility", ''), 'draft');
  v_is_feed_safe := v_video."moderation_status" in ('clean'::text, 'reported'::text)
    and public."is_creator_video_playable_source"(
      v_video."storage_path",
      v_video."storage_object_key",
      v_video."playback_url"
    );

  if v_visibility = 'public'::text and v_is_feed_safe then
    insert into public."creator_feed_items" (
      "source_type",
      "source_id",
      "creator_user_id",
      "visibility",
      "target_scope",
      "published_at",
      "status",
      "ranking_score",
      "metadata",
      "updated_at"
    )
    values (
      'creator_video',
      v_video."id"::text,
      v_video."owner_id"::text,
      'public',
      'followers',
      coalesce(v_video."updated_at", v_video."created_at", v_now),
      'active',
      0,
      jsonb_build_object('source', 'creator_video_visibility', 'route', '/player/[id]'),
      v_now
    )
    on conflict ("source_type", "source_id", "target_scope")
    do update set
      "creator_user_id" = excluded."creator_user_id",
      "visibility" = excluded."visibility",
      "published_at" = excluded."published_at",
      "status" = 'active',
      "ranking_score" = excluded."ranking_score",
      "metadata" = excluded."metadata",
      "updated_at" = excluded."updated_at";
    v_active_followers := true;

    insert into public."creator_feed_items" (
      "source_type",
      "source_id",
      "creator_user_id",
      "visibility",
      "target_scope",
      "published_at",
      "status",
      "ranking_score",
      "metadata",
      "updated_at"
    )
    values (
      'creator_video',
      v_video."id"::text,
      v_video."owner_id"::text,
      'public',
      'circle',
      coalesce(v_video."updated_at", v_video."created_at", v_now),
      'active',
      0,
      jsonb_build_object('source', 'creator_video_visibility', 'route', '/player/[id]'),
      v_now
    )
    on conflict ("source_type", "source_id", "target_scope")
    do update set
      "creator_user_id" = excluded."creator_user_id",
      "visibility" = excluded."visibility",
      "published_at" = excluded."published_at",
      "status" = 'active',
      "ranking_score" = excluded."ranking_score",
      "metadata" = excluded."metadata",
      "updated_at" = excluded."updated_at";
    v_active_circle := true;
  elsif v_visibility = 'circle'::text and v_is_feed_safe then
    insert into public."creator_feed_items" (
      "source_type",
      "source_id",
      "creator_user_id",
      "visibility",
      "target_scope",
      "published_at",
      "status",
      "ranking_score",
      "metadata",
      "updated_at"
    )
    values (
      'creator_video',
      v_video."id"::text,
      v_video."owner_id"::text,
      'circle',
      'circle',
      coalesce(v_video."updated_at", v_video."created_at", v_now),
      'active',
      0,
      jsonb_build_object('source', 'creator_video_visibility', 'route', '/player/[id]'),
      v_now
    )
    on conflict ("source_type", "source_id", "target_scope")
    do update set
      "creator_user_id" = excluded."creator_user_id",
      "visibility" = excluded."visibility",
      "published_at" = excluded."published_at",
      "status" = 'active',
      "ranking_score" = excluded."ranking_score",
      "metadata" = excluded."metadata",
      "updated_at" = excluded."updated_at";
    v_active_circle := true;
  end if;

  update public."creator_feed_items"
  set
    "status" = 'removed',
    "updated_at" = v_now
  where "source_type" = 'creator_video'
    and "source_id" = v_video."id"::text
    and (
      ("target_scope" = 'followers'::text and not v_active_followers)
      or ("target_scope" = 'circle'::text and not v_active_circle)
    );

  return jsonb_build_object(
    'video_id', v_video."id"::text,
    'visibility', v_visibility,
    'followers_active', v_active_followers,
    'circle_active', v_active_circle
  );
end;
$$;

revoke all on function public."sync_creator_video_feed_items"(text) from public;
grant execute on function public."sync_creator_video_feed_items"(text) to authenticated, postgres, service_role;

create or replace function public."sync_creator_video_feed_items_trigger"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_video public."videos"%rowtype;
  v_visibility text := 'draft';
  v_is_feed_safe boolean := false;
  v_now timestamp with time zone := timezone('utc'::text, now());
  v_active_followers boolean := false;
  v_active_circle boolean := false;
begin
  if tg_op = 'DELETE' then
    update public."creator_feed_items"
    set "status" = 'removed', "updated_at" = v_now
    where "source_type" = 'creator_video'
      and "source_id" = old."id"::text;
    return old;
  end if;

  v_video := new;
  v_visibility := coalesce(nullif(v_video."visibility", ''), 'draft');
  v_is_feed_safe := v_video."moderation_status" in ('clean'::text, 'reported'::text)
    and public."is_creator_video_playable_source"(
      v_video."storage_path",
      v_video."storage_object_key",
      v_video."playback_url"
    );

  if v_visibility = 'public'::text and v_is_feed_safe then
    insert into public."creator_feed_items" (
      "source_type",
      "source_id",
      "creator_user_id",
      "visibility",
      "target_scope",
      "published_at",
      "status",
      "ranking_score",
      "metadata",
      "updated_at"
    )
    values
      ('creator_video', v_video."id"::text, v_video."owner_id"::text, 'public', 'followers', coalesce(v_video."updated_at", v_video."created_at", v_now), 'active', 0, jsonb_build_object('source', 'creator_video_visibility', 'route', '/player/[id]'), v_now),
      ('creator_video', v_video."id"::text, v_video."owner_id"::text, 'public', 'circle', coalesce(v_video."updated_at", v_video."created_at", v_now), 'active', 0, jsonb_build_object('source', 'creator_video_visibility', 'route', '/player/[id]'), v_now)
    on conflict ("source_type", "source_id", "target_scope")
    do update set
      "creator_user_id" = excluded."creator_user_id",
      "visibility" = excluded."visibility",
      "published_at" = excluded."published_at",
      "status" = 'active',
      "ranking_score" = excluded."ranking_score",
      "metadata" = excluded."metadata",
      "updated_at" = excluded."updated_at";
    v_active_followers := true;
    v_active_circle := true;
  elsif v_visibility = 'circle'::text and v_is_feed_safe then
    insert into public."creator_feed_items" (
      "source_type",
      "source_id",
      "creator_user_id",
      "visibility",
      "target_scope",
      "published_at",
      "status",
      "ranking_score",
      "metadata",
      "updated_at"
    )
    values ('creator_video', v_video."id"::text, v_video."owner_id"::text, 'circle', 'circle', coalesce(v_video."updated_at", v_video."created_at", v_now), 'active', 0, jsonb_build_object('source', 'creator_video_visibility', 'route', '/player/[id]'), v_now)
    on conflict ("source_type", "source_id", "target_scope")
    do update set
      "creator_user_id" = excluded."creator_user_id",
      "visibility" = excluded."visibility",
      "published_at" = excluded."published_at",
      "status" = 'active',
      "ranking_score" = excluded."ranking_score",
      "metadata" = excluded."metadata",
      "updated_at" = excluded."updated_at";
    v_active_circle := true;
  end if;

  update public."creator_feed_items"
  set
    "status" = 'removed',
    "updated_at" = v_now
  where "source_type" = 'creator_video'
    and "source_id" = v_video."id"::text
    and (
      ("target_scope" = 'followers'::text and not v_active_followers)
      or ("target_scope" = 'circle'::text and not v_active_circle)
    );

  return new;
end;
$$;

drop trigger if exists "sync_creator_video_feed_items_after_change" on public."videos";
create trigger "sync_creator_video_feed_items_after_change"
  after insert or update of "visibility", "moderation_status", "storage_path", "storage_object_key", "playback_url", "updated_at" or delete
  on public."videos"
  for each row
execute function public."sync_creator_video_feed_items_trigger"();

create or replace function public."sync_profile_post_feed_items_trigger"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public."profile_posts"%rowtype;
  v_now timestamp with time zone := timezone('utc'::text, now());
  v_active boolean := false;
begin
  if tg_op = 'DELETE' then
    update public."creator_feed_items"
    set "status" = 'removed', "updated_at" = v_now
    where "source_type" = 'profile_post'
      and "source_id" = old."id"::text;
    return old;
  end if;

  v_post := new;
  v_active := v_post."deleted_at" is null
    and v_post."visibility" = 'public'::text
    and v_post."moderation_status" in ('clean'::text, 'reported'::text)
    and nullif(btrim(coalesce(v_post."body", '')), '') is not null;

  if v_active then
    insert into public."creator_feed_items" (
      "source_type",
      "source_id",
      "creator_user_id",
      "visibility",
      "target_scope",
      "published_at",
      "status",
      "ranking_score",
      "metadata",
      "updated_at"
    )
    values
      ('profile_post', v_post."id"::text, v_post."user_id", 'public', 'followers', coalesce(v_post."updated_at", v_post."created_at", v_now), 'active', 0, jsonb_build_object('source', 'profile_post', 'route', '/profile/[userId]'), v_now),
      ('profile_post', v_post."id"::text, v_post."user_id", 'public', 'circle', coalesce(v_post."updated_at", v_post."created_at", v_now), 'active', 0, jsonb_build_object('source', 'profile_post', 'route', '/profile/[userId]'), v_now)
    on conflict ("source_type", "source_id", "target_scope")
    do update set
      "creator_user_id" = excluded."creator_user_id",
      "visibility" = excluded."visibility",
      "published_at" = excluded."published_at",
      "status" = 'active',
      "ranking_score" = excluded."ranking_score",
      "metadata" = excluded."metadata",
      "updated_at" = excluded."updated_at";
  else
    update public."creator_feed_items"
    set
      "status" = 'removed',
      "updated_at" = v_now
    where "source_type" = 'profile_post'
      and "source_id" = v_post."id"::text;
  end if;

  return new;
end;
$$;

drop trigger if exists "sync_profile_post_feed_items_after_change" on public."profile_posts";
create trigger "sync_profile_post_feed_items_after_change"
  after insert or update of "visibility", "moderation_status", "deleted_at", "updated_at" or delete
  on public."profile_posts"
  for each row
  execute function public."sync_profile_post_feed_items_trigger"();

insert into public."creator_feed_items" (
  "source_type",
  "source_id",
  "creator_user_id",
  "visibility",
  "target_scope",
  "published_at",
  "status",
  "ranking_score",
  "metadata",
  "updated_at"
)
select
  'creator_video',
  video."id"::text,
  video."owner_id"::text,
  'public',
  scope."target_scope",
  coalesce(video."updated_at", video."created_at", timezone('utc'::text, now())),
  'active',
  0,
  jsonb_build_object('source', 'creator_video_visibility', 'route', '/player/[id]'),
  timezone('utc'::text, now())
from public."videos" video
cross join (values ('followers'::text), ('circle'::text)) as scope("target_scope")
where video."visibility" = 'public'::text
  and video."moderation_status" in ('clean'::text, 'reported'::text)
  and public."is_creator_video_playable_source"(video."storage_path", video."storage_object_key", video."playback_url")
on conflict ("source_type", "source_id", "target_scope")
do update set
  "creator_user_id" = excluded."creator_user_id",
  "visibility" = excluded."visibility",
  "published_at" = excluded."published_at",
  "status" = excluded."status",
  "ranking_score" = excluded."ranking_score",
  "metadata" = excluded."metadata",
  "updated_at" = excluded."updated_at";

insert into public."creator_feed_items" (
  "source_type",
  "source_id",
  "creator_user_id",
  "visibility",
  "target_scope",
  "published_at",
  "status",
  "ranking_score",
  "metadata",
  "updated_at"
)
select
  'creator_video',
  video."id"::text,
  video."owner_id"::text,
  'circle',
  'circle',
  coalesce(video."updated_at", video."created_at", timezone('utc'::text, now())),
  'active',
  0,
  jsonb_build_object('source', 'creator_video_visibility', 'route', '/player/[id]'),
  timezone('utc'::text, now())
from public."videos" video
where video."visibility" = 'circle'::text
  and video."moderation_status" in ('clean'::text, 'reported'::text)
  and public."is_creator_video_playable_source"(video."storage_path", video."storage_object_key", video."playback_url")
on conflict ("source_type", "source_id", "target_scope")
do update set
  "creator_user_id" = excluded."creator_user_id",
  "visibility" = excluded."visibility",
  "published_at" = excluded."published_at",
  "status" = excluded."status",
  "ranking_score" = excluded."ranking_score",
  "metadata" = excluded."metadata",
  "updated_at" = excluded."updated_at";

insert into public."creator_feed_items" (
  "source_type",
  "source_id",
  "creator_user_id",
  "visibility",
  "target_scope",
  "published_at",
  "status",
  "ranking_score",
  "metadata",
  "updated_at"
)
select
  'profile_post',
  post."id"::text,
  post."user_id",
  'public',
  scope."target_scope",
  coalesce(post."updated_at", post."created_at", timezone('utc'::text, now())),
  'active',
  0,
  jsonb_build_object('source', 'profile_post', 'route', '/profile/[userId]'),
  timezone('utc'::text, now())
from public."profile_posts" post
cross join (values ('followers'::text), ('circle'::text)) as scope("target_scope")
where post."deleted_at" is null
  and post."visibility" = 'public'::text
  and post."moderation_status" in ('clean'::text, 'reported'::text)
  and nullif(btrim(coalesce(post."body", '')), '') is not null
on conflict ("source_type", "source_id", "target_scope")
do update set
  "creator_user_id" = excluded."creator_user_id",
  "visibility" = excluded."visibility",
  "published_at" = excluded."published_at",
  "status" = excluded."status",
  "ranking_score" = excluded."ranking_score",
  "metadata" = excluded."metadata",
  "updated_at" = excluded."updated_at";

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  on table public."creator_feed_items" to "anon";
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  on table public."creator_feed_items" to "authenticated";
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  on table public."creator_feed_items" to "postgres";
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  on table public."creator_feed_items" to "service_role";

comment on table public."creator_feed_items" is
  'Source-level relationship feed rows for creator content and posted Profile posts. Followers read public follower rows; Chi''lly Circle members read public/circle Circle rows; drafts and legacy draft Profile posts never fan out.';
comment on function public."can_read_creator_feed_item"(text, text, text, text, text, text, text) is
  'RLS helper for relationship feeds. Follower rows require a channel follow and source access. Circle rows require active Chi''lly Circle membership and source access. Creator-video Draft and legacy draft Profile posts do not fan out.';
