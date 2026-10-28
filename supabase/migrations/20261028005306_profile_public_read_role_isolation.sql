begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Staff-role helpers are intentionally not executable by anon. A PUBLIC policy
-- referencing those helpers makes otherwise-public reads fail at expression
-- initialization. Keep authenticated policy expressions exactly unchanged and
-- isolate the existing public-content predicates into anonymous-only policies.
-- No helper grants, source visibility rules, or privileged authority change.
alter policy profile_posts_select_public_clean_or_owner on public.profile_posts to authenticated;
create policy profile_posts_select_anonymous_public on public.profile_posts
  for select to anon using (
    deleted_at is null and visibility = 'public'
    and moderation_status in ('clean', 'reported')
    and public.can_view_profile_content(user_id)
  );
alter policy profile_post_comments_select_public_clean_or_owner on public.profile_post_comments to authenticated;
create policy profile_post_comments_select_anonymous_public on public.profile_post_comments
  for select to anon using (
    deleted_at is null and moderation_status in ('clean', 'reported')
    and exists (
      select 1 from public.profile_posts post
      where post.id = profile_post_comments.post_id and post.deleted_at is null
        and post.visibility = 'public' and post.moderation_status in ('clean', 'reported')
        and public.can_view_profile_content(post.user_id)
    )
  );
alter policy profile_post_likes_select_public_clean on public.profile_post_likes to authenticated;
create policy profile_post_likes_select_anonymous_public on public.profile_post_likes
  for select to anon using (
    exists (
      select 1 from public.profile_posts post
      where post.id = profile_post_likes.post_id and post.deleted_at is null
        and post.visibility = 'public' and post.moderation_status in ('clean', 'reported')
        and public.can_view_profile_content(post.user_id)
    )
  );

-- Preserve all preexisting scan-safe surface predicates, not only Profile.
-- Staff and owner management still use the unchanged authenticated policy.
-- Dispatch lazily: initializing an unrelated room-table subquery would require
-- its SELECT grant even for a Profile attachment. This is SECURITY INVOKER;
-- source table grants and source RLS are never bypassed or expanded.
create or replace function public.anonymous_social_attachment_source_visible(p_surface_type text, p_surface_id uuid)
returns boolean language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_surface_type = 'profile_post' then
    return exists(select 1 from public.profile_posts post
      where post.id = p_surface_id and post.deleted_at is null and post.visibility = 'public'
        and post.moderation_status in ('clean', 'reported') and public.can_view_profile_content(post.user_id));
  elsif p_surface_type = 'profile_post_comment' then
    return exists(select 1 from public.profile_post_comments comment
      join public.profile_posts post on post.id = comment.post_id
      where comment.id = p_surface_id and comment.deleted_at is null
        and comment.moderation_status in ('clean', 'reported') and post.deleted_at is null
        and post.visibility = 'public' and post.moderation_status in ('clean', 'reported')
        and public.can_view_profile_content(post.user_id));
  elsif p_surface_type = 'creator_video_comment' then
    return exists(select 1 from public.creator_video_comments comment
      join public.videos video on video.id = comment.video_id
      where comment.id = p_surface_id and comment.deleted_at is null
        and comment.moderation_status in ('clean', 'reported') and video.visibility = 'public'
        and video.moderation_status in ('clean', 'reported') and public.media_scan_public_safe(video.scan_status));
  elsif p_surface_type = 'chat_message' then
    if auth.uid() is null then return false; end if;
    return exists(select 1 from public.chat_messages message where message.id = p_surface_id
      and public.can_access_chat_thread(message.thread_id));
  elsif p_surface_type = 'watch_party_room_message' then
    return exists(select 1 from public.watch_party_room_messages message where message.id = p_surface_id);
  end if;
  return false;
exception when insufficient_privilege then
  -- A source the invoking role cannot SELECT cannot authorize its attachment.
  -- In particular, do not grant anonymous room/staff access to repair Profile.
  return false;
end;
$$;
revoke all on function public.anonymous_social_attachment_source_visible(text,uuid) from public, authenticated, service_role;
grant execute on function public.anonymous_social_attachment_source_visible(text,uuid) to anon;
alter policy social_attachments_select_authorized on public.social_attachments to authenticated;
create policy social_attachments_select_anonymous_public on public.social_attachments
  for select to anon using (
    deleted_at is null and moderation_status in ('clean', 'reported')
    and public.media_scan_public_safe(scan_status)
    and public.anonymous_social_attachment_source_visible(surface_type,surface_id)
  );
commit;
