update public."videos"
set
  "playback_url" = 'https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4',
  "mime_type" = 'video/mp4',
  "updated_at" = timezone('utc'::text, now())
where "id" = '6e1c3405-7db8-4cb2-98f3-5a7642e82126'
  and "visibility" = 'public'
  and "moderation_status" in ('clean', 'reported')
  and exists (
    select 1
    from public."official_rachi_original_videos" original_link
    where original_link."video_id" = public."videos"."id"
      and original_link."official_account_id" = 'platform_rachi_official'
      and original_link."status" = 'published'
  );

comment on table public."official_rachi_original_videos" is
  'Official Rachi Originals link table. Public surfaces may read only published links, and the public card resolver still requires the linked creator video to be public and clean/reported. The 20260526 proof fixture uses a direct public-safe Big Buck Bunny MP4 from Blender Foundation, CC BY 3.0.';
