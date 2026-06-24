drop policy if exists "Public videos readable" on public."videos";
drop policy if exists "videos_select_public_or_owner" on public."videos";
drop policy if exists "videos_select_public_owner_or_reviewer" on public."videos";
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
      "scan_status",
      "storage_path",
      "storage_object_key",
      "playback_url",
      (auth.uid())::text
    )
  );

comment on policy "videos_select_visibility_access" on public."videos" is
  'Only owner/staff or scan-safe readable creator videos are selectable. Historical permissive public select policies are dropped in this migration.';
