create schema if not exists "private";

revoke all on schema "private" from public;

create table if not exists "private"."media_object_storage_migration_audit" (
  "id" bigserial primary key,
  "migration_id" text not null,
  "batch_id" text not null,
  "table_name" text not null check (
    "table_name" in ('videos', 'social_attachments', 'media_scan_jobs', 'video_renditions')
  ),
  "row_id" text not null,
  "source_type" text not null,
  "source_id" text not null,
  "old_storage_provider" text,
  "old_storage_bucket" text,
  "old_storage_object_key" text,
  "old_storage_path" text,
  "old_manifest_path" text,
  "new_storage_provider" text not null default 'cloudflare_r2',
  "new_storage_bucket" text not null,
  "new_storage_object_key" text not null,
  "new_storage_path" text,
  "status" text not null default 'updated' check ("status" in ('updated', 'rolled_back')),
  "row_before" jsonb not null default '{}'::jsonb,
  "row_after" jsonb not null default '{}'::jsonb,
  "copied_verified_at" timestamptz not null default now(),
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

alter table "private"."media_object_storage_migration_audit" enable row level security;

create unique index if not exists "media_object_storage_migration_audit_batch_row_idx"
  on "private"."media_object_storage_migration_audit" ("batch_id", "table_name", "row_id");

revoke all on table "private"."media_object_storage_migration_audit" from public;
revoke all on table "private"."media_object_storage_migration_audit" from anon;
revoke all on table "private"."media_object_storage_migration_audit" from authenticated;

create or replace function public.media_object_storage_migrate_verified_rows(
  p_batch_id text,
  p_updates jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_update jsonb;
  v_table_name text;
  v_row_id text;
  v_target_bucket text;
  v_target_object_key text;
  v_before jsonb;
  v_after jsonb;
  v_updated_rows integer := 0;
begin
  if coalesce(p_batch_id, '') = '' then
    raise exception 'media_object_storage_batch_id_required';
  end if;

  if jsonb_typeof(p_updates) is distinct from 'array' then
    raise exception 'media_object_storage_updates_array_required';
  end if;

  for v_update in select value from jsonb_array_elements(p_updates)
  loop
    v_table_name := v_update->>'table_name';
    v_row_id := v_update->>'row_id';
    v_target_bucket := v_update->>'target_bucket';
    v_target_object_key := v_update->>'target_object_key';

    if v_table_name not in ('videos', 'social_attachments', 'media_scan_jobs', 'video_renditions') then
      raise exception 'media_object_storage_unsupported_table';
    end if;

    if coalesce(v_row_id, '') = '' then
      raise exception 'media_object_storage_row_id_required';
    end if;

    if v_target_bucket <> 'chillywood-media-origin' then
      raise exception 'media_object_storage_invalid_target_bucket';
    end if;

    if coalesce(v_target_object_key, '') = ''
      or v_target_object_key like '/%'
      or v_target_object_key like '%..%'
      or v_target_object_key like 'playback/public/%'
      or v_target_object_key like 'playback/protected/%'
      or v_target_object_key like 'playback/premium/%'
      or not (
        v_target_object_key like 'originals/%'
        or v_target_object_key like 'uploads/%'
        or v_target_object_key like 'source/%'
        or v_target_object_key like 'processing/%'
        or v_target_object_key like 'quarantine/%'
      )
    then
      raise exception 'media_object_storage_invalid_target_key';
    end if;

    if v_table_name = 'videos' then
      select to_jsonb(t) into v_before
      from public.videos t
      where t.id::text = v_row_id
      for update;

      if v_before is null then
        raise exception 'media_object_storage_row_not_found';
      end if;

      update public.videos
      set storage_provider = 'cloudflare_r2',
          storage_bucket = 'chillywood-media-origin',
          storage_object_key = v_target_object_key,
          storage_path = v_target_object_key
      where id::text = v_row_id
      returning to_jsonb(videos) into v_after;
    elsif v_table_name = 'social_attachments' then
      select to_jsonb(t) into v_before
      from public.social_attachments t
      where t.id::text = v_row_id
      for update;

      if v_before is null then
        raise exception 'media_object_storage_row_not_found';
      end if;

      update public.social_attachments
      set storage_provider = 'cloudflare_r2',
          storage_bucket = 'chillywood-media-origin',
          storage_object_key = v_target_object_key,
          storage_path = v_target_object_key
      where id::text = v_row_id
      returning to_jsonb(social_attachments) into v_after;
    elsif v_table_name = 'media_scan_jobs' then
      select to_jsonb(t) into v_before
      from public.media_scan_jobs t
      where t.id::text = v_row_id
      for update;

      if v_before is null then
        raise exception 'media_object_storage_row_not_found';
      end if;

      update public.media_scan_jobs
      set storage_provider = 'cloudflare_r2',
          storage_bucket = 'chillywood-media-origin',
          storage_object_key = v_target_object_key
      where id::text = v_row_id
      returning to_jsonb(media_scan_jobs) into v_after;
    elsif v_table_name = 'video_renditions' then
      select to_jsonb(t) into v_before
      from public.video_renditions t
      where t.id::text = v_row_id
      for update;

      if v_before is null then
        raise exception 'media_object_storage_row_not_found';
      end if;

      update public.video_renditions
      set storage_bucket = 'chillywood-media-origin',
          storage_path = v_target_object_key,
          manifest_path = case
            when coalesce(manifest_path, '') <> '' then v_target_object_key
            else manifest_path
          end
      where id::text = v_row_id
      returning to_jsonb(video_renditions) into v_after;
    end if;

    insert into private.media_object_storage_migration_audit (
      migration_id,
      batch_id,
      table_name,
      row_id,
      source_type,
      source_id,
      old_storage_provider,
      old_storage_bucket,
      old_storage_object_key,
      old_storage_path,
      old_manifest_path,
      new_storage_bucket,
      new_storage_object_key,
      new_storage_path,
      row_before,
      row_after,
      status,
      updated_at
    )
    values (
      coalesce(v_update->>'migration_id', 'media-object-storage-r2'),
      p_batch_id,
      v_table_name,
      v_row_id,
      coalesce(v_update->>'source_type', v_table_name),
      coalesce(v_update->>'source_id', v_row_id),
      coalesce(v_before->>'storage_provider', case when v_table_name = 'video_renditions' then 's3' else null end),
      v_before->>'storage_bucket',
      v_before->>'storage_object_key',
      v_before->>'storage_path',
      v_before->>'manifest_path',
      'chillywood-media-origin',
      v_target_object_key,
      v_target_object_key,
      v_before,
      v_after,
      'updated',
      now()
    )
    on conflict (batch_id, table_name, row_id)
    do update set
      row_after = excluded.row_after,
      status = 'updated',
      updated_at = now();

    v_updated_rows := v_updated_rows + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'batch_id', p_batch_id,
    'updated_rows', v_updated_rows
  );
end;
$$;

revoke all on function public.media_object_storage_migrate_verified_rows(text, jsonb) from public;
revoke all on function public.media_object_storage_migrate_verified_rows(text, jsonb) from anon;
revoke all on function public.media_object_storage_migrate_verified_rows(text, jsonb) from authenticated;
grant execute on function public.media_object_storage_migrate_verified_rows(text, jsonb) to service_role;
