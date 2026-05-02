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
    or public.has_platform_role(array['owner'::text, 'operator'::text, 'moderator'::text])
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
    or public.has_platform_role(array['owner'::text, 'operator'::text, 'moderator'::text])
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
      public.has_platform_role(array['owner'::text, 'operator'::text, 'moderator'::text])
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
        auth.uid() is not null
        and "owner_user_id" = auth.uid()::text
        and "surface_type" not in ('profile_post', 'profile_post_comment')
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
