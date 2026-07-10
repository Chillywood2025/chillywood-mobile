create schema if not exists "private";

revoke all on schema "private" from public;

create table if not exists "private"."media_object_storage_reference_resolutions" (
  "id" bigserial primary key,
  "table_name" text not null,
  "row_id" text not null,
  "storage_provider" text not null,
  "storage_bucket_redacted" text,
  "object_key_hash" text not null,
  "resolution_status" text not null check (
    "resolution_status" in (
      'stale_history',
      'orphaned_scan_job',
      'unsupported_provider_stale',
      'active_required',
      'unknown'
    )
  ),
  "resolution_reason" text not null,
  "resolved_at" timestamptz not null default now(),
  "resolved_by" text not null default 'media-object-storage-migration',
  "migration_id" text not null,
  "old_provider" text,
  "old_bucket_redacted" text,
  "old_object_key_hash" text not null,
  "active_dependency" boolean not null default true,
  "shutdown_blocker" boolean not null default true,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  constraint "media_object_storage_reference_resolutions_table_check"
    check ("table_name" in ('media_scan_jobs')),
  constraint "media_object_storage_reference_resolutions_hash_check"
    check ("object_key_hash" ~ '^[a-f0-9]{64}$' and "old_object_key_hash" ~ '^[a-f0-9]{64}$')
);

alter table "private"."media_object_storage_reference_resolutions" enable row level security;

create unique index if not exists "media_object_storage_reference_resolutions_row_idx"
  on "private"."media_object_storage_reference_resolutions" ("table_name", "row_id");

create index if not exists "media_object_storage_reference_resolutions_shutdown_idx"
  on "private"."media_object_storage_reference_resolutions" ("shutdown_blocker", "active_dependency", "resolution_status");

revoke all on table "private"."media_object_storage_reference_resolutions" from public;
revoke all on table "private"."media_object_storage_reference_resolutions" from anon;
revoke all on table "private"."media_object_storage_reference_resolutions" from authenticated;
grant select, insert, update on table "private"."media_object_storage_reference_resolutions" to service_role;
grant usage, select on sequence "private"."media_object_storage_reference_resolutions_id_seq" to service_role;

create or replace function public.media_object_storage_resolve_scan_job_refs(
  p_batch_id text,
  p_resolutions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_resolution jsonb;
  v_row_id text;
  v_status text;
  v_reason text;
  v_object_key_hash text;
  v_old_provider text;
  v_old_bucket_redacted text;
  v_active_dependency boolean;
  v_shutdown_blocker boolean;
  v_job public.media_scan_jobs%rowtype;
  v_written integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'media_object_storage_resolution_service_role_required';
  end if;

  if coalesce(p_batch_id, '') = '' then
    raise exception 'media_object_storage_resolution_batch_id_required';
  end if;

  if jsonb_typeof(p_resolutions) is distinct from 'array' then
    raise exception 'media_object_storage_resolutions_array_required';
  end if;

  for v_resolution in select value from jsonb_array_elements(p_resolutions)
  loop
    if coalesce(v_resolution->>'table_name', '') <> 'media_scan_jobs' then
      raise exception 'media_object_storage_resolution_unsupported_table';
    end if;

    v_row_id := v_resolution->>'row_id';
    v_status := v_resolution->>'resolution_status';
    v_reason := coalesce(nullif(btrim(v_resolution->>'resolution_reason'), ''), 'resolved historical storage reference');
    v_object_key_hash := lower(coalesce(v_resolution->>'object_key_hash', ''));
    v_old_provider := coalesce(nullif(btrim(v_resolution->>'old_provider'), ''), 'unknown');
    v_old_bucket_redacted := coalesce(nullif(btrim(v_resolution->>'old_bucket_redacted'), ''), 'redacted');
    v_active_dependency := coalesce((v_resolution->>'active_dependency')::boolean, true);
    v_shutdown_blocker := coalesce((v_resolution->>'shutdown_blocker')::boolean, true);

    if coalesce(v_row_id, '') = '' then
      raise exception 'media_object_storage_resolution_row_id_required';
    end if;

    if v_status not in ('stale_history', 'orphaned_scan_job', 'unsupported_provider_stale', 'active_required', 'unknown') then
      raise exception 'media_object_storage_resolution_status_invalid';
    end if;

    if v_object_key_hash !~ '^[a-f0-9]{64}$' then
      raise exception 'media_object_storage_resolution_hash_invalid';
    end if;

    select * into v_job
    from public.media_scan_jobs
    where id::text = v_row_id
    for update;

    if not found then
      raise exception 'media_object_storage_resolution_scan_job_not_found';
    end if;

    if v_status in ('active_required', 'unknown') and v_shutdown_blocker is false then
      raise exception 'media_object_storage_resolution_active_or_unknown_must_block';
    end if;

    if v_status in ('stale_history', 'orphaned_scan_job', 'unsupported_provider_stale')
      and (v_active_dependency is true or v_shutdown_blocker is true)
    then
      raise exception 'media_object_storage_resolution_stale_status_must_not_block';
    end if;

    if v_job.storage_provider not in ('s3', 'hetzner_s3')
      and v_job.storage_bucket <> 'chillywood-media-prod'
    then
      raise exception 'media_object_storage_resolution_not_hetzner_ref';
    end if;

    insert into private.media_object_storage_reference_resolutions (
      table_name,
      row_id,
      storage_provider,
      storage_bucket_redacted,
      object_key_hash,
      resolution_status,
      resolution_reason,
      resolved_at,
      resolved_by,
      migration_id,
      old_provider,
      old_bucket_redacted,
      old_object_key_hash,
      active_dependency,
      shutdown_blocker,
      metadata,
      updated_at
    )
    values (
      'media_scan_jobs',
      v_row_id,
      coalesce(v_job.storage_provider, 'unknown'),
      v_old_bucket_redacted,
      v_object_key_hash,
      v_status,
      v_reason,
      now(),
      coalesce(nullif(btrim(v_resolution->>'resolved_by'), ''), 'media-object-storage-migration'),
      coalesce(nullif(btrim(v_resolution->>'migration_id'), ''), p_batch_id),
      v_old_provider,
      v_old_bucket_redacted,
      v_object_key_hash,
      v_active_dependency,
      v_shutdown_blocker,
      coalesce(v_resolution->'metadata', '{}'::jsonb),
      now()
    )
    on conflict (table_name, row_id)
    do update set
      storage_provider = excluded.storage_provider,
      storage_bucket_redacted = excluded.storage_bucket_redacted,
      object_key_hash = excluded.object_key_hash,
      resolution_status = excluded.resolution_status,
      resolution_reason = excluded.resolution_reason,
      resolved_at = excluded.resolved_at,
      resolved_by = excluded.resolved_by,
      migration_id = excluded.migration_id,
      old_provider = excluded.old_provider,
      old_bucket_redacted = excluded.old_bucket_redacted,
      old_object_key_hash = excluded.old_object_key_hash,
      active_dependency = excluded.active_dependency,
      shutdown_blocker = excluded.shutdown_blocker,
      metadata = excluded.metadata,
      updated_at = now();

    v_written := v_written + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'batch_id', p_batch_id,
    'resolved_rows', v_written
  );
end;
$$;

revoke all on function public.media_object_storage_resolve_scan_job_refs(text, jsonb) from public;
revoke all on function public.media_object_storage_resolve_scan_job_refs(text, jsonb) from anon;
revoke all on function public.media_object_storage_resolve_scan_job_refs(text, jsonb) from authenticated;
grant execute on function public.media_object_storage_resolve_scan_job_refs(text, jsonb) to service_role;

create or replace function public.media_object_storage_reference_resolution_summary()
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_raw_refs integer := 0;
  v_resolved_stale integer := 0;
  v_unresolved_active integer := 0;
  v_unresolved_unknown integer := 0;
  v_shutdown_blockers integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'media_object_storage_resolution_service_role_required';
  end if;

  select count(*)::integer into v_raw_refs
  from public.media_scan_jobs job
  where job.storage_provider in ('s3', 'hetzner_s3')
    or job.storage_bucket = 'chillywood-media-prod';

  select count(*)::integer into v_resolved_stale
  from public.media_scan_jobs job
  join private.media_object_storage_reference_resolutions resolution
    on resolution.table_name = 'media_scan_jobs'
   and resolution.row_id = job.id::text
  where (job.storage_provider in ('s3', 'hetzner_s3') or job.storage_bucket = 'chillywood-media-prod')
    and resolution.resolution_status in ('stale_history', 'orphaned_scan_job', 'unsupported_provider_stale')
    and resolution.active_dependency = false
    and resolution.shutdown_blocker = false;

  select count(*)::integer into v_shutdown_blockers
  from public.media_scan_jobs job
  left join private.media_object_storage_reference_resolutions resolution
    on resolution.table_name = 'media_scan_jobs'
   and resolution.row_id = job.id::text
  where (job.storage_provider in ('s3', 'hetzner_s3') or job.storage_bucket = 'chillywood-media-prod')
    and (
      resolution.id is null
      or resolution.shutdown_blocker = true
      or resolution.active_dependency = true
      or resolution.resolution_status in ('active_required', 'unknown')
    );

  select count(*)::integer into v_unresolved_active
  from public.media_scan_jobs job
  left join private.media_object_storage_reference_resolutions resolution
    on resolution.table_name = 'media_scan_jobs'
   and resolution.row_id = job.id::text
  where (job.storage_provider in ('s3', 'hetzner_s3') or job.storage_bucket = 'chillywood-media-prod')
    and (
      job.status in ('pending_scan', 'scanning')
      or (job.status = 'scan_failed' and job.attempt_count < job.max_attempts)
      or coalesce(resolution.active_dependency, true) = true
    )
    and (
      resolution.id is null
      or resolution.shutdown_blocker = true
      or resolution.resolution_status in ('active_required', 'unknown')
    );

  select count(*)::integer into v_unresolved_unknown
  from public.media_scan_jobs job
  left join private.media_object_storage_reference_resolutions resolution
    on resolution.table_name = 'media_scan_jobs'
   and resolution.row_id = job.id::text
  where (job.storage_provider in ('s3', 'hetzner_s3') or job.storage_bucket = 'chillywood-media-prod')
    and (
      resolution.id is null
      or resolution.resolution_status = 'unknown'
      or resolution.shutdown_blocker = true
    );

  return jsonb_build_object(
    'ok', true,
    'raw_media_scan_jobs_hetzner_refs', v_raw_refs,
    'resolved_stale_refs', v_resolved_stale,
    'active_unresolved_hetzner_object_refs', v_shutdown_blockers,
    'unresolved_active_refs', v_unresolved_active,
    'unresolved_unknown_refs', v_unresolved_unknown,
    'shutdown_ready_by_resolution', v_raw_refs > 0 and v_shutdown_blockers = 0 and v_raw_refs = v_resolved_stale
  );
end;
$$;

revoke all on function public.media_object_storage_reference_resolution_summary() from public;
revoke all on function public.media_object_storage_reference_resolution_summary() from anon;
revoke all on function public.media_object_storage_reference_resolution_summary() from authenticated;
grant execute on function public.media_object_storage_reference_resolution_summary() to service_role;

create or replace function public.media_object_storage_reference_resolutions_backup()
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_rows jsonb := '[]'::jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'media_object_storage_resolution_service_role_required';
  end if;

  select coalesce(jsonb_agg(to_jsonb(resolution) order by resolution.id), '[]'::jsonb)
    into v_rows
  from private.media_object_storage_reference_resolutions resolution;

  return jsonb_build_object(
    'ok', true,
    'row_count', jsonb_array_length(v_rows),
    'rows', v_rows
  );
end;
$$;

revoke all on function public.media_object_storage_reference_resolutions_backup() from public;
revoke all on function public.media_object_storage_reference_resolutions_backup() from anon;
revoke all on function public.media_object_storage_reference_resolutions_backup() from authenticated;
grant execute on function public.media_object_storage_reference_resolutions_backup() to service_role;
