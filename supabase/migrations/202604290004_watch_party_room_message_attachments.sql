alter table public."social_attachments"
  drop constraint if exists "social_attachments_surface_type_check";

alter table public."social_attachments"
  add constraint "social_attachments_surface_type_check"
  check ("surface_type" in ('profile_post', 'profile_post_comment', 'creator_video_comment', 'chat_message', 'watch_party_room_message'));

drop policy if exists "watch_party_room_messages_delete_own_for_attachment_rollback" on public."watch_party_room_messages";
create policy "watch_party_room_messages_delete_own_for_attachment_rollback"
  on public."watch_party_room_messages"
  for delete
  to authenticated
  using (
    auth.uid() is not null
    and "user_id" = auth.uid()::text
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
    and "storage_bucket" = 'social-attachments'
    and split_part("storage_path", '/', 1) = auth.uid()::text
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
        )
      )
      or (
        "surface_type" = 'profile_post_comment'
        and exists (
          select 1
          from public."profile_post_comments" comment
          where comment."id" = "social_attachments"."surface_id"
            and comment."user_id" = auth.uid()::text
            and comment."deleted_at" is null
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
          where message."id" = "social_attachments"."surface_id"
            and message."user_id" = auth.uid()::text
        )
      )
    )
  );

drop policy if exists "social_attachments_storage_select_authorized" on storage.objects;
create policy "social_attachments_storage_select_authorized"
  on storage.objects
  for select
  to public
  using (
    bucket_id = 'social-attachments'
    and exists (
      select 1
      from public."social_attachments" attachment
      where attachment."storage_bucket" = storage.objects.bucket_id
        and attachment."storage_path" = storage.objects.name
        and attachment."deleted_at" is null
        and attachment."moderation_status" in ('clean', 'reported')
        and (
          (
            auth.uid() is not null
            and attachment."owner_user_id" = auth.uid()::text
          )
          or public.has_platform_role(array['owner'::text, 'operator'::text, 'moderator'::text])
          or (
            attachment."surface_type" = 'profile_post'
            and exists (
              select 1
              from public."profile_posts" post
              where post."id" = attachment."surface_id"
                and post."deleted_at" is null
                and post."visibility" = 'public'
                and post."moderation_status" in ('clean', 'reported')
            )
          )
          or (
            attachment."surface_type" = 'profile_post_comment'
            and exists (
              select 1
              from public."profile_post_comments" comment
              join public."profile_posts" post on post."id" = comment."post_id"
              where comment."id" = attachment."surface_id"
                and comment."deleted_at" is null
                and comment."moderation_status" in ('clean', 'reported')
                and post."deleted_at" is null
                and post."visibility" = 'public'
                and post."moderation_status" in ('clean', 'reported')
            )
          )
          or (
            attachment."surface_type" = 'creator_video_comment'
            and exists (
              select 1
              from public."creator_video_comments" comment
              join public."videos" video on video."id" = comment."video_id"
              where comment."id" = attachment."surface_id"
                and comment."deleted_at" is null
                and comment."moderation_status" in ('clean', 'reported')
                and video."visibility" = 'public'
                and video."moderation_status" in ('clean', 'reported')
            )
          )
          or (
            attachment."surface_type" = 'chat_message'
            and auth.uid() is not null
            and exists (
              select 1
              from public."chat_messages" message
              where message."id" = attachment."surface_id"
                and public.can_access_chat_thread(message."thread_id")
            )
          )
          or (
            attachment."surface_type" = 'watch_party_room_message'
            and exists (
              select 1
              from public."watch_party_room_messages" message
              join public."watch_party_rooms" room on room."party_id" = message."party_id"
              where message."id" = attachment."surface_id"
            )
          )
        )
    )
  );
