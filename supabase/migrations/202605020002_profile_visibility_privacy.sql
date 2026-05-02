alter table public."user_profiles"
  add column if not exists "profile_visibility" text;

update public."user_profiles"
set "profile_visibility" = coalesce(nullif("profile_visibility", ''), 'everyone'::text)
where "profile_visibility" is null
   or "profile_visibility" = '';

alter table public."user_profiles"
  alter column "profile_visibility" set default 'everyone'::text,
  alter column "profile_visibility" set not null;

alter table public."user_profiles"
  drop constraint if exists "user_profiles_profile_visibility_check";

alter table public."user_profiles"
  add constraint "user_profiles_profile_visibility_check"
  check ("profile_visibility" in ('everyone'::text, 'chilly_circle_only'::text, 'private'::text));

create index if not exists "user_profiles_profile_visibility_idx"
  on public."user_profiles" using btree ("profile_visibility", "updated_at" desc);

create or replace function public.can_view_profile_content(profile_user_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actor_user_id text := (auth.uid())::text;
  owner_user_id text := nullif(btrim(coalesce(profile_user_id, '')), '');
  owner_profile_visibility text := 'everyone';
  pair_low_id text;
  pair_high_id text;
begin
  if owner_user_id is null then
    return false;
  end if;

  if actor_user_id is not null and actor_user_id = owner_user_id then
    return true;
  end if;

  if actor_user_id is not null and exists (
    select 1
    from public."channel_audience_blocks"
    where (
      "channel_user_id" = actor_user_id
      and "blocked_user_id" = owner_user_id
    ) or (
      "channel_user_id" = owner_user_id
      and "blocked_user_id" = actor_user_id
    )
    limit 1
  ) then
    return false;
  end if;

  select coalesce(nullif("profile_visibility", ''), 'everyone'::text)
  into owner_profile_visibility
  from public."user_profiles"
  where "user_id" = owner_user_id
  limit 1;

  owner_profile_visibility := coalesce(owner_profile_visibility, 'everyone'::text);

  if owner_profile_visibility = 'everyone'::text then
    return true;
  end if;

  if actor_user_id is null or owner_profile_visibility = 'private'::text then
    return false;
  end if;

  pair_low_id := least(actor_user_id, owner_user_id);
  pair_high_id := greatest(actor_user_id, owner_user_id);

  return exists (
    select 1
    from public."user_friendships"
    where "user_low_id" = pair_low_id
      and "user_high_id" = pair_high_id
      and "status" = 'active'::text
    limit 1
  );
end;
$$;

revoke all on function public.can_view_profile_content(text) from public;
grant execute on function public.can_view_profile_content(text) to "anon";
grant execute on function public.can_view_profile_content(text) to "authenticated";
grant execute on function public.can_view_profile_content(text) to "postgres";
grant execute on function public.can_view_profile_content(text) to "service_role";

drop policy if exists "profile_posts_select_public_clean_or_owner" on public."profile_posts";
create policy "profile_posts_select_public_clean_or_owner"
  on public."profile_posts"
  for select
  to public
  using (
    (
      "deleted_at" is null
      and "visibility" = 'public'
      and "moderation_status" in ('clean', 'reported')
      and public.can_view_profile_content("user_id")
    )
    or (
      auth.uid() is not null
      and "user_id" = auth.uid()::text
      and "deleted_at" is null
    )
    or public.has_platform_role(array['owner'::text, 'operator'::text, 'moderator'::text])
  );

drop policy if exists "profile_post_comments_select_public_clean_or_owner" on public."profile_post_comments";
create policy "profile_post_comments_select_public_clean_or_owner"
  on public."profile_post_comments"
  for select
  to public
  using (
    (
      "deleted_at" is null
      and "moderation_status" in ('clean', 'reported')
      and exists (
        select 1
        from public."profile_posts" post
        where post."id" = "profile_post_comments"."post_id"
          and post."deleted_at" is null
          and post."visibility" = 'public'
          and post."moderation_status" in ('clean', 'reported')
          and public.can_view_profile_content(post."user_id")
      )
    )
    or (
      auth.uid() is not null
      and "user_id" = auth.uid()::text
      and "deleted_at" is null
    )
    or public.has_platform_role(array['owner'::text, 'operator'::text, 'moderator'::text])
  );

drop policy if exists "profile_post_comments_insert_own_on_public_clean_post" on public."profile_post_comments";
create policy "profile_post_comments_insert_own_on_public_clean_post"
  on public."profile_post_comments"
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and "user_id" = auth.uid()::text
    and "deleted_at" is null
    and "moderation_status" = 'clean'
    and exists (
      select 1
      from public."profile_posts" post
      where post."id" = "profile_post_comments"."post_id"
        and post."deleted_at" is null
        and post."visibility" = 'public'
        and post."moderation_status" = 'clean'
        and public.can_view_profile_content(post."user_id")
    )
  );

drop policy if exists "profile_post_likes_select_public_clean" on public."profile_post_likes";
create policy "profile_post_likes_select_public_clean"
  on public."profile_post_likes"
  for select
  to public
  using (
    exists (
      select 1
      from public."profile_posts" post
      where post."id" = "profile_post_likes"."post_id"
        and post."deleted_at" is null
        and post."visibility" = 'public'
        and post."moderation_status" in ('clean', 'reported')
        and public.can_view_profile_content(post."user_id")
    )
    or (
      auth.uid() is not null
      and "user_id" = auth.uid()::text
    )
    or public.has_platform_role(array['owner'::text, 'operator'::text, 'moderator'::text])
  );

drop policy if exists "profile_post_likes_insert_own_on_public_clean_post" on public."profile_post_likes";
create policy "profile_post_likes_insert_own_on_public_clean_post"
  on public."profile_post_likes"
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and "user_id" = auth.uid()::text
    and exists (
      select 1
      from public."profile_posts" post
      where post."id" = "profile_post_likes"."post_id"
        and post."deleted_at" is null
        and post."visibility" = 'public'
        and post."moderation_status" = 'clean'
        and public.can_view_profile_content(post."user_id")
    )
  );

drop policy if exists "social_attachments_select_authorized" on public."social_attachments";
create policy "social_attachments_select_authorized"
  on public."social_attachments"
  for select
  to public
  using (
    "deleted_at" is null
    and "moderation_status" in ('clean', 'reported')
    and (
      (
        auth.uid() is not null
        and "owner_user_id" = auth.uid()::text
      )
      or public.has_platform_role(array['owner'::text, 'operator'::text, 'moderator'::text])
      or (
        "surface_type" = 'profile_post'
        and exists (
          select 1
          from public."profile_posts" post
          where post."id" = "social_attachments"."surface_id"
            and post."deleted_at" is null
            and post."visibility" = 'public'
            and post."moderation_status" in ('clean', 'reported')
            and public.can_view_profile_content(post."user_id")
        )
      )
      or (
        "surface_type" = 'profile_post_comment'
        and exists (
          select 1
          from public."profile_post_comments" comment
          join public."profile_posts" post on post."id" = comment."post_id"
          where comment."id" = "social_attachments"."surface_id"
            and comment."deleted_at" is null
            and comment."moderation_status" in ('clean', 'reported')
            and post."deleted_at" is null
            and post."visibility" = 'public'
            and post."moderation_status" in ('clean', 'reported')
            and public.can_view_profile_content(post."user_id")
        )
      )
      or (
        "surface_type" = 'creator_video_comment'
        and exists (
          select 1
          from public."creator_video_comments" comment
          join public."videos" video on video."id" = comment."video_id"
          where comment."id" = "social_attachments"."surface_id"
            and comment."deleted_at" is null
            and comment."moderation_status" in ('clean', 'reported')
            and video."visibility" = 'public'
            and video."moderation_status" in ('clean', 'reported')
        )
      )
      or (
        "surface_type" = 'chat_message'
        and auth.uid() is not null
        and exists (
          select 1
          from public."chat_messages" message
          where message."id" = "social_attachments"."surface_id"
            and public.can_access_chat_thread(message."thread_id")
        )
      )
      or (
        "surface_type" = 'watch_party_room_message'
        and exists (
          select 1
          from public."watch_party_room_messages" message
          join public."watch_party_rooms" room on room."party_id" = message."party_id"
          where message."id" = "social_attachments"."surface_id"
        )
      )
    )
  );

drop policy if exists "social_attachments_insert_own_surface" on public."social_attachments";
create policy "social_attachments_insert_own_surface"
  on public."social_attachments"
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and "owner_user_id" = auth.uid()::text
    and (
      (
        "storage_provider" = 'supabase'
        and "storage_bucket" = 'social-attachments'
      )
      or (
        "storage_provider" = 's3'
        and "storage_bucket" = 'chillywood-media-prod'
      )
    )
    and split_part(coalesce(nullif("storage_object_key", ''), "storage_path"), '/', 1) = auth.uid()::text
    and "deleted_at" is null
    and "moderation_status" = 'clean'
    and "size_bytes" <= 262144000
    and (
      (
        "surface_type" = 'profile_post'
        and exists (
          select 1
          from public."profile_posts" post
          where post."id" = "social_attachments"."surface_id"
            and post."user_id" = auth.uid()::text
            and post."deleted_at" is null
            and public.can_view_profile_content(post."user_id")
        )
      )
      or (
        "surface_type" = 'profile_post_comment'
        and exists (
          select 1
          from public."profile_post_comments" comment
          join public."profile_posts" post on post."id" = comment."post_id"
          where comment."id" = "social_attachments"."surface_id"
            and comment."user_id" = auth.uid()::text
            and comment."deleted_at" is null
            and public.can_view_profile_content(post."user_id")
        )
      )
      or (
        "surface_type" = 'creator_video_comment'
        and exists (
          select 1
          from public."creator_video_comments" comment
          where comment."id" = "social_attachments"."surface_id"
            and comment."user_id" = auth.uid()::text
            and comment."deleted_at" is null
        )
      )
      or (
        "surface_type" = 'chat_message'
        and exists (
          select 1
          from public."chat_messages" message
          where message."id" = "social_attachments"."surface_id"
            and message."sender_user_id" = auth.uid()::text
            and public.can_access_chat_thread(message."thread_id")
        )
      )
      or (
        "surface_type" = 'watch_party_room_message'
        and exists (
          select 1
          from public."watch_party_room_messages" message
          join public."watch_party_rooms" room on room."party_id" = message."party_id"
          where message."id" = "social_attachments"."surface_id"
            and message."user_id" = auth.uid()::text
        )
      )
    )
  );
