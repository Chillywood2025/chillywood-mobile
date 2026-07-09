-- Draft trusted media transcode job and rendition metadata foundation.
-- Design/proof lane only: applying this migration does not switch production
-- playback, does not create a production worker, and does not migrate existing
-- creator videos. Resolver activation requires a later approved migration.

create table if not exists public."media_transcode_jobs" (
  "id" uuid primary key default gen_random_uuid(),
  "source_type" text not null,
  "source_id" text not null,
  "creator_id" uuid,
  "requested_by" uuid,
  "input_provider" text not null,
  "input_bucket_role" text not null default 'private_origin',
  "input_bucket" text,
  "input_path" text not null,
  "output_provider" text not null,
  "output_bucket_role" text not null default 'public_playback',
  "output_bucket" text,
  "output_prefix" text not null,
  "status" text not null default 'queued',
  "requested_renditions" jsonb not null default '[]'::jsonb,
  "completed_renditions" jsonb not null default '[]'::jsonb,
  "duration_ms" integer,
  "source_width" integer,
  "source_height" integer,
  "source_codec" text,
  "worker_version" text,
  "source_hash" text,
  "error_code" text,
  "error_message" text,
  "proof_mode" boolean not null default false,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  "started_at" timestamptz,
  "completed_at" timestamptz,
  constraint "media_transcode_jobs_status_check"
    check ("status" in ('queued', 'probing', 'transcoding', 'uploading', 'ready', 'failed', 'canceled')),
  constraint "media_transcode_jobs_source_type_check"
    check ("source_type" in ('creator_video', 'proof_demo')),
  constraint "media_transcode_jobs_provider_check"
    check (
      "input_provider" in ('origin_signed_direct', 'cloudflare_r2_custom_domain', 'cloudflare_r2', 'hetzner_s3', 'supabase_storage')
      and "output_provider" in ('origin_signed_direct', 'cloudflare_r2_custom_domain', 'cloudflare_r2', 'hetzner_s3', 'supabase_storage')
    ),
  constraint "media_transcode_jobs_bucket_role_check"
    check (
      "input_bucket_role" in ('private_origin', 'public_playback')
      and "output_bucket_role" in ('private_origin', 'public_playback')
    ),
  constraint "media_transcode_jobs_path_relative_check"
    check (
      "input_path" !~ '(^/|\\.\\.|^https?://|[[:cntrl:]])'
      and "output_prefix" !~ '(^/|\\.\\.|^https?://|[[:cntrl:]])'
    ),
  constraint "media_transcode_jobs_metrics_positive_check"
    check (
      ("duration_ms" is null or "duration_ms" > 0)
      and ("source_width" is null or "source_width" > 0)
      and ("source_height" is null or "source_height" > 0)
    )
);

create table if not exists public."media_renditions" (
  "id" uuid primary key default gen_random_uuid(),
  "job_id" uuid references public."media_transcode_jobs"("id") on delete set null,
  "media_id" text not null,
  "video_id" uuid references public."videos"("id") on delete cascade,
  "source_type" text not null,
  "source_id" text not null,
  "creator_id" uuid,
  "rendition_label" text not null,
  "delivery_format" text not null,
  "delivery_provider" text not null,
  "storage_provider" text not null,
  "bucket_role" text not null,
  "storage_bucket" text,
  "storage_path" text,
  "public_playback_path" text,
  "manifest_path" text,
  "variant_playlist_path" text,
  "width" integer,
  "height" integer,
  "duration_ms" integer,
  "codec" text,
  "bitrate" integer,
  "file_size_bytes" bigint,
  "cache_policy" text,
  "visibility" text not null default 'private',
  "scan_status" text not null default 'pending_scan',
  "moderation_status" text not null default 'pending_review',
  "is_public_playback_safe" boolean not null default false,
  "is_original" boolean not null default false,
  "is_ready" boolean not null default false,
  "worker_version" text,
  "source_hash" text,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "media_renditions_source_type_check"
    check ("source_type" in ('creator_video', 'proof_demo')),
  constraint "media_renditions_label_check"
    check ("rendition_label" in ('original', '360p', '480p', '720p', '1080p')),
  constraint "media_renditions_delivery_format_check"
    check ("delivery_format" in ('mp4', 'hls')),
  constraint "media_renditions_delivery_provider_check"
    check ("delivery_provider" in ('origin_signed_direct', 'cloudflare_r2_custom_domain')),
  constraint "media_renditions_storage_provider_check"
    check ("storage_provider" in ('cloudflare_r2', 'hetzner_s3', 'supabase_storage')),
  constraint "media_renditions_bucket_role_check"
    check ("bucket_role" in ('public_playback', 'private_origin')),
  constraint "media_renditions_visibility_check"
    check ("visibility" in ('public', 'premium', 'private')),
  constraint "media_renditions_scan_status_check"
    check ("scan_status" in ('pending_scan', 'scanning', 'clean', 'approved', 'manual_review', 'malware_detected', 'scan_failed', 'quarantined')),
  constraint "media_renditions_moderation_status_check"
    check ("moderation_status" in ('clean', 'reported', 'approved', 'allowed', 'pending_review', 'hidden', 'removed', 'blocked')),
  constraint "media_renditions_dimensions_positive_check"
    check (
      ("width" is null or "width" > 0)
      and ("height" is null or "height" > 0)
      and ("duration_ms" is null or "duration_ms" > 0)
      and ("bitrate" is null or "bitrate" > 0)
      and ("file_size_bytes" is null or "file_size_bytes" >= 0)
    ),
  constraint "media_renditions_paths_relative_check"
    check (
      ("storage_path" is null or "storage_path" !~ '(^/|\\.\\.|^https?://|[[:cntrl:]])')
      and ("public_playback_path" is null or "public_playback_path" !~ '(^/|\\.\\.|^https?://|[[:cntrl:]])')
      and ("manifest_path" is null or "manifest_path" !~ '(^/|\\.\\.|^https?://|[[:cntrl:]])')
      and ("variant_playlist_path" is null or "variant_playlist_path" !~ '(^/|\\.\\.|^https?://|[[:cntrl:]])')
    ),
  constraint "media_renditions_original_private_check"
    check (
      not "is_original"
      or (
        "rendition_label" = 'original'
        and "visibility" = 'private'
        and "bucket_role" = 'private_origin'
        and "is_public_playback_safe" = false
      )
    ),
  constraint "media_renditions_hd_not_public_free_check"
    check (
      "rendition_label" not in ('720p', '1080p')
      or "visibility" in ('premium', 'private')
    ),
  constraint "media_renditions_ready_requires_worker_proof_check"
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
          ("delivery_format" = 'mp4' and nullif(btrim(coalesce("public_playback_path", "storage_path", '')), '') is not null)
          or ("delivery_format" = 'hls' and nullif(btrim(coalesce("manifest_path", '')), '') is not null)
        )
      )
    ),
  constraint "media_renditions_hls_manifest_check"
    check (
      "delivery_format" <> 'hls'
      or (
        "manifest_path" is not null
        and "manifest_path" like '%/master.m3u8'
      )
    ),
  constraint "media_renditions_public_cdn_safety_check"
    check (
      "delivery_provider" <> 'cloudflare_r2_custom_domain'
      or (
        "is_ready" = true
        and "is_public_playback_safe" = true
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
      )
    ),
  constraint "media_renditions_video_label_format_key"
    unique ("source_type", "source_id", "rendition_label", "delivery_format")
);

create index if not exists "media_transcode_jobs_source_idx"
  on public."media_transcode_jobs" ("source_type", "source_id");
create index if not exists "media_transcode_jobs_status_idx"
  on public."media_transcode_jobs" ("status", "updated_at" desc);
create index if not exists "media_transcode_jobs_creator_idx"
  on public."media_transcode_jobs" ("creator_id", "updated_at" desc);

create index if not exists "media_renditions_source_idx"
  on public."media_renditions" ("source_type", "source_id");
create index if not exists "media_renditions_ready_idx"
  on public."media_renditions" ("is_ready", "source_type", "source_id")
  where "is_ready" = true;
create index if not exists "media_renditions_label_idx"
  on public."media_renditions" ("rendition_label");
create index if not exists "media_renditions_delivery_provider_idx"
  on public."media_renditions" ("delivery_provider");
create index if not exists "media_renditions_visibility_idx"
  on public."media_renditions" ("visibility");
create index if not exists "media_renditions_job_idx"
  on public."media_renditions" ("job_id");

create or replace function public."touch_media_transcode_jobs_updated_at"()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new."updated_at" = timezone('utc'::text, now());
  return new;
end;
$$;

create or replace function public."touch_media_renditions_updated_at"()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new."updated_at" = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists "touch_media_transcode_jobs_updated_at_trigger" on public."media_transcode_jobs";
create trigger "touch_media_transcode_jobs_updated_at_trigger"
  before update on public."media_transcode_jobs"
  for each row
  execute function public."touch_media_transcode_jobs_updated_at"();

drop trigger if exists "touch_media_renditions_updated_at_trigger" on public."media_renditions";
create trigger "touch_media_renditions_updated_at_trigger"
  before update on public."media_renditions"
  for each row
  execute function public."touch_media_renditions_updated_at"();

alter table public."media_transcode_jobs" enable row level security;
alter table public."media_renditions" enable row level security;

revoke all on table public."media_transcode_jobs" from "anon";
revoke all on table public."media_transcode_jobs" from "authenticated";
grant select on table public."media_transcode_jobs" to "authenticated";
grant all on table public."media_transcode_jobs" to "service_role";

revoke all on table public."media_renditions" from "anon";
revoke all on table public."media_renditions" from "authenticated";
grant select on table public."media_renditions" to "anon", "authenticated";
grant all on table public."media_renditions" to "service_role";

drop policy if exists "media_transcode_jobs_select_owner_operator" on public."media_transcode_jobs";
create policy "media_transcode_jobs_select_owner_operator"
  on public."media_transcode_jobs"
  for select
  to authenticated
  using (
    ("creator_id" = auth.uid())
    or ("requested_by" = auth.uid())
    or public.has_platform_role(array['owner'::text, 'operator'::text])
  );

drop policy if exists "media_transcode_jobs_no_direct_client_insert" on public."media_transcode_jobs";
create policy "media_transcode_jobs_no_direct_client_insert"
  on public."media_transcode_jobs"
  for insert
  to anon, authenticated
  with check (false);

drop policy if exists "media_transcode_jobs_no_direct_client_update" on public."media_transcode_jobs";
create policy "media_transcode_jobs_no_direct_client_update"
  on public."media_transcode_jobs"
  for update
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "media_transcode_jobs_no_direct_client_delete" on public."media_transcode_jobs";
create policy "media_transcode_jobs_no_direct_client_delete"
  on public."media_transcode_jobs"
  for delete
  to anon, authenticated
  using (false);

drop policy if exists "media_renditions_select_owner_operator" on public."media_renditions";
create policy "media_renditions_select_owner_operator"
  on public."media_renditions"
  for select
  to authenticated
  using (
    ("creator_id" = auth.uid())
    or public.has_platform_role(array['owner'::text, 'operator'::text])
  );

drop policy if exists "media_renditions_select_public_safe_metadata" on public."media_renditions";
create policy "media_renditions_select_public_safe_metadata"
  on public."media_renditions"
  for select
  to anon, authenticated
  using (
    "is_ready" = true
    and "is_public_playback_safe" = true
    and "visibility" = 'public'
    and "is_original" = false
    and "delivery_provider" = 'cloudflare_r2_custom_domain'
    and "storage_provider" = 'cloudflare_r2'
    and "bucket_role" = 'public_playback'
    and "scan_status" in ('clean', 'approved')
    and "moderation_status" in ('clean', 'approved', 'allowed')
    and "public_playback_path" like 'playback/public/%'
    and "public_playback_path" !~ '(^|/)(originals?|masters?|sources?|uploads|private|premium|processing|moderation[-_]blocked|unscanned)(/|$)'
  );

drop policy if exists "media_renditions_no_direct_client_insert" on public."media_renditions";
create policy "media_renditions_no_direct_client_insert"
  on public."media_renditions"
  for insert
  to anon, authenticated
  with check (false);

drop policy if exists "media_renditions_no_direct_client_update" on public."media_renditions";
create policy "media_renditions_no_direct_client_update"
  on public."media_renditions"
  for update
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "media_renditions_no_direct_client_delete" on public."media_renditions";
create policy "media_renditions_no_direct_client_delete"
  on public."media_renditions"
  for delete
  to anon, authenticated
  using (false);

comment on table public."media_transcode_jobs" is
  'Draft server-owned media transcode job queue. Clients cannot insert/update/delete jobs; service-role workers own status, worker_version, source_hash, and output paths. Applying this table alone does not make production transcoding live.';

comment on table public."media_renditions" is
  'Draft trusted rendition metadata for future Cloudflare R2/HLS playback. Public CDN eligibility must come from service-role/worker-written ready rows only; clients cannot mark rows ready/public-safe or set public playback paths. Applying this table alone does not switch production playback.';

comment on column public."media_renditions"."is_public_playback_safe" is
  'Trusted worker-owned flag. Client input must never set this field.';
comment on column public."media_renditions"."is_ready" is
  'Trusted worker-owned readiness flag. Ready rows require worker_version, source_hash, dimensions, bitrate, and a playback path or HLS manifest.';
comment on column public."media_renditions"."public_playback_path" is
  'Trusted worker-owned R2 public playback object path. Public CDN rows must remain under playback/public/ and must not use private/original/Premium prefixes.';
