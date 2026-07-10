-- Add protected Premium HD rendition metadata support.
-- This is additive and keeps unsigned public CDN eligibility constrained to
-- playback/public/. Premium HD rows require a tokenized protected provider,
-- protected bucket role, clean scan/moderation, and protected prefix.

alter table public."media_renditions"
  add column if not exists "protected_playback_path" text,
  add column if not exists "is_protected_playback_safe" boolean not null default false;

alter table public."media_transcode_jobs"
  drop constraint if exists "media_transcode_jobs_provider_check";

alter table public."media_transcode_jobs"
  add constraint "media_transcode_jobs_provider_check"
  check (
    "input_provider" in ('origin_signed_direct', 'cloudflare_r2_custom_domain', 'cloudflare_r2_premium_token', 'cloudflare_r2', 'hetzner_s3', 'supabase_storage')
    and "output_provider" in ('origin_signed_direct', 'cloudflare_r2_custom_domain', 'cloudflare_r2_premium_token', 'cloudflare_r2', 'hetzner_s3', 'supabase_storage')
  );

alter table public."media_transcode_jobs"
  drop constraint if exists "media_transcode_jobs_bucket_role_check";

alter table public."media_transcode_jobs"
  add constraint "media_transcode_jobs_bucket_role_check"
  check (
    "input_bucket_role" in ('private_origin', 'public_playback', 'protected_premium')
    and "output_bucket_role" in ('private_origin', 'public_playback', 'protected_premium')
  );

alter table public."media_renditions"
  drop constraint if exists "media_renditions_delivery_provider_check";

alter table public."media_renditions"
  add constraint "media_renditions_delivery_provider_check"
  check ("delivery_provider" in ('origin_signed_direct', 'cloudflare_r2_custom_domain', 'cloudflare_r2_premium_token'));

alter table public."media_renditions"
  drop constraint if exists "media_renditions_bucket_role_check";

alter table public."media_renditions"
  add constraint "media_renditions_bucket_role_check"
  check ("bucket_role" in ('public_playback', 'private_origin', 'protected_premium'));

alter table public."media_renditions"
  drop constraint if exists "media_renditions_paths_relative_check";

alter table public."media_renditions"
  add constraint "media_renditions_paths_relative_check"
  check (
    ("storage_path" is null or "storage_path" !~ '(^/|\\.\\.|^https?://|[[:cntrl:]])')
    and ("public_playback_path" is null or "public_playback_path" !~ '(^/|\\.\\.|^https?://|[[:cntrl:]])')
    and ("protected_playback_path" is null or "protected_playback_path" !~ '(^/|\\.\\.|^https?://|[[:cntrl:]])')
    and ("manifest_path" is null or "manifest_path" !~ '(^/|\\.\\.|^https?://|[[:cntrl:]])')
    and ("variant_playlist_path" is null or "variant_playlist_path" !~ '(^/|\\.\\.|^https?://|[[:cntrl:]])')
  );

alter table public."media_renditions"
  drop constraint if exists "media_renditions_ready_requires_worker_proof_check";

alter table public."media_renditions"
  add constraint "media_renditions_ready_requires_worker_proof_check"
  check (
    "is_ready" = false
    or (
      nullif(btrim(coalesce("worker_version", '')), '') is not null
      and nullif(btrim(coalesce("source_hash", '')), '') is not null
      and "width" is not null
      and "height" is not null
      and "duration_ms" is not null
      and "bitrate" is not null
      and (
        ("delivery_format" = 'mp4' and nullif(btrim(coalesce("public_playback_path", "protected_playback_path", "storage_path", '')), '') is not null)
        or ("delivery_format" = 'hls' and nullif(btrim(coalesce("manifest_path", '')), '') is not null)
      )
    )
  );

alter table public."media_renditions"
  drop constraint if exists "media_renditions_public_cdn_safety_check";

alter table public."media_renditions"
  add constraint "media_renditions_public_cdn_safety_check"
  check (
    "delivery_provider" <> 'cloudflare_r2_custom_domain'
    or (
      "is_ready" = true
      and "is_public_playback_safe" = true
      and "is_protected_playback_safe" = false
      and "visibility" = 'public'
      and "is_original" = false
      and "storage_provider" = 'cloudflare_r2'
      and "bucket_role" = 'public_playback'
      and "scan_status" in ('clean', 'approved')
      and "moderation_status" in ('clean', 'approved', 'allowed')
      and "public_playback_path" like 'playback/public/%'
      and "public_playback_path" !~ '(^|/)(originals?|masters?|sources?|uploads|private|premium|processing|moderation[-_]blocked|unscanned)(/|$)'
      and ("manifest_path" is null or "manifest_path" like 'playback/public/%')
      and ("variant_playlist_path" is null or "variant_playlist_path" like 'playback/public/%')
      and "protected_playback_path" is null
    )
  );

alter table public."media_renditions"
  drop constraint if exists "media_renditions_premium_token_cdn_safety_check";

alter table public."media_renditions"
  add constraint "media_renditions_premium_token_cdn_safety_check"
  check (
    "delivery_provider" <> 'cloudflare_r2_premium_token'
    or (
      "is_ready" = true
      and "is_public_playback_safe" = false
      and "is_protected_playback_safe" = true
      and "visibility" = 'premium'
      and "rendition_label" in ('720p', '1080p')
      and "is_original" = false
      and "storage_provider" = 'cloudflare_r2'
      and "bucket_role" = 'protected_premium'
      and "scan_status" in ('clean', 'approved')
      and "moderation_status" in ('clean', 'approved', 'allowed')
      and "protected_playback_path" like 'playback/protected/premium/%'
      and "manifest_path" like 'playback/protected/premium/%'
      and ("variant_playlist_path" is null or "variant_playlist_path" like 'playback/protected/premium/%')
      and coalesce("public_playback_path", '') = ''
      and "protected_playback_path" !~ '(^|/)(originals?|masters?|sources?|uploads|private|processing|moderation[-_]blocked|unscanned)(/|$)'
      and "manifest_path" !~ '(^|/)(originals?|masters?|sources?|uploads|private|processing|moderation[-_]blocked|unscanned)(/|$)'
    )
  );

create index if not exists "media_renditions_protected_premium_ready_idx"
  on public."media_renditions" ("source_type", "source_id", "rendition_label")
  where "delivery_provider" = 'cloudflare_r2_premium_token'
    and "bucket_role" = 'protected_premium'
    and "visibility" = 'premium'
    and "is_ready" = true;

comment on column public."media_renditions"."protected_playback_path" is
  'Trusted worker-owned protected R2 playback path. Premium HD token rows must remain under playback/protected/premium/ and are served only through the token-verifying Worker.';

comment on column public."media_renditions"."is_protected_playback_safe" is
  'Trusted worker-owned flag for token-protected Premium playback. This is not public unsigned CDN safety.';
