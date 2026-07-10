-- Allow migrated source/original metadata to point at Cloudflare R2 private origin.
-- This does not make origin objects public and does not change playback eligibility.

alter table public."videos"
  drop constraint if exists "videos_storage_provider_check";

alter table public."videos"
  add constraint "videos_storage_provider_check"
  check ("storage_provider" in ('supabase', 's3', 'cloudflare_r2'));

alter table public."social_attachments"
  drop constraint if exists "social_attachments_storage_provider_check";

alter table public."social_attachments"
  add constraint "social_attachments_storage_provider_check"
  check ("storage_provider" in ('supabase', 's3', 'cloudflare_r2'));

alter table public."social_attachments"
  drop constraint if exists "social_attachments_bucket_check";

alter table public."social_attachments"
  add constraint "social_attachments_bucket_check"
  check (
    (
      "storage_provider" = 'supabase'
      and "storage_bucket" = 'social-attachments'
    )
    or (
      "storage_provider" = 's3'
      and "storage_bucket" = 'chillywood-media-prod'
    )
    or (
      "storage_provider" = 'cloudflare_r2'
      and "storage_bucket" = 'chillywood-media-origin'
    )
  );

alter table public."media_scan_jobs"
  drop constraint if exists "media_scan_jobs_provider_check";

alter table public."media_scan_jobs"
  add constraint "media_scan_jobs_provider_check"
  check ("storage_provider" in ('supabase', 's3', 'cloudflare_r2'));
