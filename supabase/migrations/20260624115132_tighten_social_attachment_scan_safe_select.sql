-- Tighten social attachment metadata visibility so scan-pending / failed /
-- malware attachments do not leak through direct public table reads. Owners and
-- authorized staff retain management visibility; every non-owner surface read
-- must be scan-public-safe.

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
        public.media_scan_public_safe("scan_status")
        and (
          (
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
                and public.media_scan_public_safe(video."scan_status")
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
              where message."id" = "social_attachments"."surface_id"
            )
          )
        )
      )
    )
  );
