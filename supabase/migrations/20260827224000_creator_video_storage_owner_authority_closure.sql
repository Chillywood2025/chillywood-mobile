-- Creator-video Storage is a private delivery boundary.  A raw owner-prefixed
-- key proves where a client uploaded bytes; it does not prove a current
-- session, an unrestricted account, a safe scan, or a row/content entitlement.

create or replace function public."creator_video_storage_owner_current_authority"(
  p_bucket text,
  p_object_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and pg_catalog.btrim(coalesce(p_bucket,''))='creator-videos'
    and nullif(pg_catalog.btrim(coalesce(p_object_key,'')),'') is not null
    and (storage."foldername"(pg_catalog.btrim(p_object_key)))[1]=auth.uid()::text
    and public."wave1_current_caller_authority_internal"()
    and not public."is_account_access_restricted"(auth.uid()::text);
$$;
revoke all on function public."creator_video_storage_owner_current_authority"(text,text)
  from public,anon,authenticated,service_role;
grant execute on function public."creator_video_storage_owner_current_authority"(text,text)
  to authenticated;
comment on function public."creator_video_storage_owner_current_authority"(text,text) is
  'Boolean-only owner upload/delete proof: exact creator-videos prefix plus current non-restore session and unrestricted account.';

-- This helper returns only a boolean.  Source or thumbnail metadata is never
-- returned to the caller; every candidate must be an exact Supabase row/key
-- binding and independently malware-safe before canonical content authority
-- may admit it. Staff preview is intentionally confined to the audited media
-- endpoint; a platform role is not direct Storage authority.
create or replace function public."creator_video_storage_object_access_allowed"(
  p_bucket text,
  p_object_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.btrim(coalesce(p_bucket,''))='creator-videos'
    and nullif(pg_catalog.btrim(coalesce(p_object_key,'')),'') is not null
    and exists (
      select 1
      from public."videos" video
      where pg_catalog.lower(pg_catalog.btrim(coalesce(video."storage_provider",'')))='supabase'
        and video."storage_bucket"=pg_catalog.btrim(p_bucket)
        and video."quarantined_at" is null
        and video."moderation_status" in ('clean','reported')
        and public."media_scan_public_safe"(video."scan_status")
        and (
          (
            pg_catalog.btrim(p_object_key)=coalesce(
              nullif(pg_catalog.btrim(coalesce(video."storage_object_key",'')),''),
              nullif(pg_catalog.btrim(coalesce(video."storage_path",'')),'')
            )
            and (storage."foldername"(pg_catalog.btrim(p_object_key)))[1]
              =video."owner_id"::text
          )
          or (
            pg_catalog.btrim(p_object_key)=video."thumb_storage_path"
            and video."thumb_storage_path" like
              video."owner_id"::text||'/'||video."id"::text||'/cover-%'
            and video."thumb_storage_path" not like '%..%'
            and video."thumb_quarantined_at" is null
            and public."media_scan_public_safe"(video."thumb_scan_status")
            and exists (
              select 1
              from public."media_scan_jobs" scan_job
              where scan_job."target_table"='videos'
                and scan_job."target_column"='thumbnail'
                and scan_job."target_id"=video."id"::text
                and pg_catalog.lower(pg_catalog.btrim(scan_job."storage_provider"))='supabase'
                and scan_job."storage_bucket"=pg_catalog.btrim(p_bucket)
                and scan_job."storage_object_key"=pg_catalog.btrim(p_object_key)
                and scan_job."status"='clean'
            )
          )
        )
        and public."can_read_creator_video_row"(
          video."owner_id"::text,
          video."visibility",
          video."moderation_status",
          video."scan_status",
          video."storage_path",
          video."storage_object_key",
          video."playback_url",
          auth.uid()::text
        )
    );
$$;
revoke all on function public."creator_video_storage_object_access_allowed"(text,text)
  from public,anon,authenticated,service_role;
grant execute on function public."creator_video_storage_object_access_allowed"(text,text)
  to anon,authenticated;
comment on function public."creator_video_storage_object_access_allowed"(text,text) is
  'Boolean-only private Storage read gate for one exact safe Supabase creator-video source or independently scanned thumbnail.';

-- Legacy video_renditions remain a distinct Storage path.  The global path
-- claim and creator/video binding installed immediately before this migration
-- are mandatory here.  Premium uses the current exact provider-backed Premium
-- resolver; owning another authority or a free rendition cannot substitute.
create or replace function public."creator_video_storage_rendition_access_allowed"(
  p_bucket text,
  p_object_key text,
  p_required_tier text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.btrim(coalesce(p_bucket,''))='creator-videos'
    and pg_catalog.lower(pg_catalog.btrim(coalesce(p_required_tier,'')))
      in ('free','premium')
    and nullif(pg_catalog.btrim(coalesce(p_object_key,'')),'') is not null
    and exists (
      select 1
      from public."video_renditions" rendition
      join public."videos" video on video."id"=rendition."video_id"
      where rendition."storage_bucket"=pg_catalog.btrim(p_bucket)
        and (
          rendition."storage_path"=pg_catalog.btrim(p_object_key)
          or rendition."manifest_path"=pg_catalog.btrim(p_object_key)
        )
        and rendition."status"='ready'
        and rendition."quality_label"<>'original'
        and rendition."access_tier"=
          pg_catalog.lower(pg_catalog.btrim(p_required_tier))
        and rendition."quarantined_at" is null
        and video."quarantined_at" is null
        and video."moderation_status" in ('clean','reported')
        and public."media_scan_public_safe"(video."scan_status")
        and public."media_scan_public_safe"(rendition."scan_status")
        and public."video_rendition_binding_valid"(
          rendition."video_id",rendition."owner_id"
        )
        and public."video_rendition_output_paths_valid"(
          rendition."id",rendition."storage_path",rendition."manifest_path"
        )
        and public."can_read_creator_video_row"(
          video."owner_id"::text,
          video."visibility",
          video."moderation_status",
          video."scan_status",
          video."storage_path",
          video."storage_object_key",
          video."playback_url",
          auth.uid()::text
        )
        and (
          pg_catalog.lower(pg_catalog.btrim(p_required_tier))='free'
          or case
            when auth.uid() is null then false
            else public."monetization_has_active_premium"(auth.uid())
          end
        )
    );
$$;
revoke all on function public."creator_video_storage_rendition_access_allowed"(text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public."creator_video_storage_rendition_access_allowed"(text,text,text)
  to anon,authenticated;
comment on function public."creator_video_storage_rendition_access_allowed"(text,text,text) is
  'Boolean-only exact legacy rendition gate. Free and Premium remain separate; Premium requires current provider-backed Premium. Staff preview uses the audited media endpoint and is not direct Storage authority.';

drop policy if exists "creator_videos_storage_owner_insert" on storage."objects";
create policy "creator_videos_storage_owner_insert"
  on storage."objects"
  for insert
  to authenticated
  with check (
    public."creator_video_storage_owner_current_authority"("bucket_id","name")
    and public."has_active_premium_creator_tool_access"(auth.uid()::text)
    and public."media_scan_storage_key_available"(
      "bucket_id","name",auth.uid()::text
    )
  );

-- Byte replacement remains intentionally unavailable.  A fresh upload must
-- use a fresh never-scanned key; no UPDATE policy is introduced.
drop policy if exists "creator_videos_storage_owner_update" on storage."objects";

drop policy if exists "creator_videos_storage_owner_delete" on storage."objects";
create policy "creator_videos_storage_owner_delete"
  on storage."objects"
  for delete
  to authenticated
  using (
    public."creator_video_storage_owner_current_authority"("bucket_id","name")
  );

drop policy if exists "creator_videos_storage_select_visibility_access"
  on storage."objects";
create policy "creator_videos_storage_select_visibility_access"
  on storage."objects"
  for select
  to anon,authenticated
  using (
    public."creator_video_storage_object_access_allowed"("bucket_id","name")
  );

drop policy if exists "creator_videos_storage_select_free_renditions"
  on storage."objects";
create policy "creator_videos_storage_select_free_renditions"
  on storage."objects"
  for select
  to anon,authenticated
  using (
    public."creator_video_storage_rendition_access_allowed"(
      "bucket_id","name",'free'
    )
  );

drop policy if exists "creator_videos_storage_select_premium_renditions"
  on storage."objects";
create policy "creator_videos_storage_select_premium_renditions"
  on storage."objects"
  for select
  to authenticated
  using (
    public."creator_video_storage_rendition_access_allowed"(
      "bucket_id","name",'premium'
    )
  );
