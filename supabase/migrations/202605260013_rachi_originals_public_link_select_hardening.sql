drop policy if exists "official_rachi_original_videos_select_published"
  on public."official_rachi_original_videos";

create policy "official_rachi_original_videos_select_published"
  on public."official_rachi_original_videos"
  for select
  to public
  using (
    "official_account_id" = 'platform_rachi_official'
    and "status" = 'published'
    and exists (
      select 1
      from public."videos" video
      where video."id" = public."official_rachi_original_videos"."video_id"
        and video."visibility" = 'public'
        and video."moderation_status" in ('clean', 'reported')
    )
  );

comment on policy "official_rachi_original_videos_select_published"
  on public."official_rachi_original_videos" is
  'Public reads of official Rachi Originals links require both a published official link and a linked public moderation-safe video.';
