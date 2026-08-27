-- Whole-app pre-release media authority closure.
--
-- Public delivery is malware-clean only.  Client-owned rows may describe
-- content, but they may not manufacture scanner evidence or change the
-- provider/object identity that server-side delivery trusts.

create or replace function public.media_scan_public_safe(scan_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(btrim(coalesce(scan_status, ''))) = 'clean';
$$;

revoke all on function public.media_scan_public_safe(text) from public;
grant execute on function public.media_scan_public_safe(text) to anon, authenticated, service_role;

comment on function public.media_scan_public_safe(text) is
  'Fail-closed public media gate. Only an explicit completed malware-clean result is public-safe; manual review and failures remain blocked.';

-- External-origin upload authority is issued and verified by the media Edge
-- function.  A database row may bind an object only after the provider has
-- reported the exact reserved MIME type and byte length.  Object keys are
-- single-use even after deletion, so old clean scan evidence can never be
-- transferred to replacement bytes.
create table if not exists public.media_upload_reservations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  surface_type text not null check (surface_type in ('creator_video', 'social_attachment')),
  storage_provider text not null check (storage_provider in ('s3', 'cloudflare_r2')),
  storage_bucket text not null check (btrim(storage_bucket) <> ''),
  storage_object_key text not null check (
    btrim(storage_object_key) <> ''
    and storage_object_key not like '/%'
    and storage_object_key not like '%..%'
  ),
  expected_mime_type text not null check (btrim(expected_mime_type) <> ''),
  expected_size_bytes bigint not null check (expected_size_bytes > 0),
  status text not null default 'reserved'
    check (status in ('reserved', 'verified', 'quarantined', 'deleted')),
  expires_at timestamptz not null,
  observed_mime_type text,
  observed_size_bytes bigint check (observed_size_bytes is null or observed_size_bytes > 0),
  verified_at timestamptz,
  attached_record_id text,
  attached_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  unique (storage_provider, storage_bucket, storage_object_key),
  check (
    (status = 'reserved' and verified_at is null)
    or (status = 'verified' and verified_at is not null)
    or status in ('quarantined', 'deleted')
  ),
  check (
    attached_at is null
    or (status in ('verified', 'deleted') and attached_record_id is not null)
  )
);

-- Keep reruns and partially applied review databases on the final tombstone
-- invariant.  Earlier review iterations allowed attachment only while the
-- reservation was verified; a deleted reservation must retain that exact
-- attachment identity for idempotent provider cleanup.
alter table public.media_upload_reservations
  drop constraint if exists media_upload_reservations_check1;
alter table public.media_upload_reservations
  drop constraint if exists media_upload_reservations_attachment_state_check;
alter table public.media_upload_reservations
  add constraint media_upload_reservations_attachment_state_check check (
    attached_at is null
    or (status in ('verified', 'deleted') and attached_record_id is not null)
  );

create index if not exists media_upload_reservations_owner_created_idx
  on public.media_upload_reservations(owner_user_id, created_at desc);
create index if not exists media_upload_reservations_expiry_idx
  on public.media_upload_reservations(status, expires_at)
  where status = 'reserved';

alter table public.media_upload_reservations enable row level security;
alter table public.media_upload_reservations force row level security;
revoke all on table public.media_upload_reservations from public, anon, authenticated;
grant all on table public.media_upload_reservations to service_role;

create or replace function public.consume_verified_media_upload(
  p_surface_type text,
  p_storage_provider text,
  p_storage_bucket text,
  p_storage_object_key text,
  p_expected_mime_type text,
  p_expected_size_bytes bigint,
  p_record_id text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null
    or p_surface_type not in ('creator_video', 'social_attachment')
    or nullif(btrim(coalesce(p_record_id, '')), '') is null
  then
    return false;
  end if;

  update public.media_upload_reservations reservation
  set attached_record_id = btrim(p_record_id),
      attached_at = coalesce(reservation.attached_at, transaction_timestamp()),
      updated_at = transaction_timestamp()
  where reservation.owner_user_id = v_owner
    and reservation.surface_type = p_surface_type
    and reservation.storage_provider = lower(btrim(coalesce(p_storage_provider, '')))
    and reservation.storage_bucket = btrim(coalesce(p_storage_bucket, ''))
    and reservation.storage_object_key = btrim(coalesce(p_storage_object_key, ''))
    and reservation.status = 'verified'
    and reservation.verified_at is not null
    and reservation.verified_at <= reservation.expires_at
    and reservation.observed_mime_type is not null
    and reservation.observed_size_bytes is not null
    and (
      p_expected_mime_type is null
      or lower(split_part(btrim(p_expected_mime_type), ';', 1)) = lower(split_part(reservation.observed_mime_type, ';', 1))
    )
    and (p_expected_size_bytes is null or p_expected_size_bytes = reservation.observed_size_bytes)
    and (
      reservation.attached_record_id is null
      or reservation.attached_record_id = btrim(p_record_id)
    );

  return found;
end;
$$;

revoke all on function public.consume_verified_media_upload(text, text, text, text, text, bigint, text)
  from public, anon;
grant execute on function public.consume_verified_media_upload(text, text, text, text, text, bigint, text)
  to authenticated, service_role;

comment on table public.media_upload_reservations is
  'Service-owned, single-use external-origin upload reservations. Verified rows bind provider-observed MIME/size to one exact media record and never grant client authority.';

-- Revoke delivery authority before mutating the provider object.  This makes
-- an old, still-live presigned PUT harmless: recreated bytes cannot inherit a
-- verified reservation or a migration receipt after deletion has started.
-- The operation is exact, transactional, idempotent for retries, and callable
-- only by the trusted media gateway.
create or replace function public.revoke_media_object_delivery(
  p_surface_type text,
  p_storage_provider text,
  p_storage_bucket text,
  p_storage_object_key text,
  p_owner_user_id uuid,
  p_record_id text,
  p_legacy_table_name text,
  p_legacy_row_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_surface_type text := lower(btrim(coalesce(p_surface_type, '')));
  v_provider text := lower(btrim(coalesce(p_storage_provider, '')));
  v_bucket text := btrim(coalesce(p_storage_bucket, ''));
  v_object_key text := btrim(coalesce(p_storage_object_key, ''));
  v_record_id text := nullif(btrim(coalesce(p_record_id, '')), '');
  v_legacy_table text := nullif(btrim(coalesce(p_legacy_table_name, '')), '');
  v_legacy_row_id text := nullif(btrim(coalesce(p_legacy_row_id, '')), '');
  v_reservation public.media_upload_reservations%rowtype;
  v_audit_count integer := 0;
  v_live_binding boolean := false;
begin
  if p_owner_user_id is null
    or v_surface_type not in ('creator_video', 'social_attachment')
    or v_provider not in ('s3', 'cloudflare_r2')
    or v_bucket = ''
    or v_object_key = ''
    or v_object_key like '/%'
    or v_object_key like '%..%'
  then
    return jsonb_build_object('revoked', false, 'reason', 'invalid_identity');
  end if;

  select reservation.*
  into v_reservation
  from public.media_upload_reservations reservation
  where reservation.storage_provider = v_provider
    and reservation.storage_bucket = v_bucket
    and reservation.storage_object_key = v_object_key
  for update;

  if found then
    if v_reservation.owner_user_id is distinct from p_owner_user_id
      or v_reservation.surface_type is distinct from v_surface_type
      or (
        v_record_id is null
        and v_reservation.attached_record_id is not null
      )
      or (
        v_record_id is not null
        and (
          v_reservation.attached_record_id is distinct from v_record_id
          or v_reservation.attached_at is null
        )
      )
      or (
        v_reservation.status <> 'deleted'
        and v_record_id is not null
        and v_reservation.status <> 'verified'
      )
    then
      return jsonb_build_object('revoked', false, 'reason', 'reservation_identity_mismatch');
    end if;

    update public.media_upload_reservations reservation
    set status = 'deleted',
        deleted_at = coalesce(reservation.deleted_at, transaction_timestamp()),
        updated_at = transaction_timestamp()
    where reservation.id = v_reservation.id;

    return jsonb_build_object(
      'revoked', true,
      'source', 'reservation',
      'alreadyDeleted', v_reservation.status = 'deleted'
    );
  end if;

  -- Unattached upload cleanup has no historical migration fallback.
  if v_record_id is null
    or v_legacy_table is null
    or v_legacy_row_id is null
    or v_legacy_row_id <> v_record_id
    or (
      v_surface_type = 'creator_video'
      and v_legacy_table not in ('videos', 'video_renditions')
    )
    or (
      v_surface_type = 'social_attachment'
      and v_legacy_table <> 'social_attachments'
    )
  then
    return jsonb_build_object('revoked', false, 'reason', 'current_provenance_required');
  end if;

  if v_legacy_table = 'videos' then
    select exists (
      select 1
      from public.videos video
      where video.id::text = v_legacy_row_id
        and video.owner_id = p_owner_user_id
        and lower(btrim(coalesce(video.storage_provider, ''))) = v_provider
        and video.storage_bucket = v_bucket
        and v_object_key in (
          coalesce(nullif(video.storage_object_key, ''), video.storage_path),
          video.thumb_storage_path
        )
    ) into v_live_binding;
  elsif v_legacy_table = 'video_renditions' then
    select exists (
      select 1
      from public.video_renditions rendition
      where rendition.id::text = v_legacy_row_id
        and rendition.owner_id = p_owner_user_id
        and v_provider = 'cloudflare_r2'
        and rendition.storage_bucket = v_bucket
        and v_object_key in (rendition.storage_path, rendition.manifest_path)
    ) into v_live_binding;
  elsif v_legacy_table = 'social_attachments' then
    select exists (
      select 1
      from public.social_attachments attachment
      where attachment.id::text = v_legacy_row_id
        and attachment.owner_user_id = p_owner_user_id::text
        and lower(btrim(coalesce(attachment.storage_provider, ''))) = v_provider
        and attachment.storage_bucket = v_bucket
        and v_object_key = coalesce(
          nullif(attachment.storage_object_key, ''),
          attachment.storage_path
        )
    ) into v_live_binding;
  end if;

  if not v_live_binding then
    return jsonb_build_object('revoked', false, 'reason', 'live_record_identity_mismatch');
  end if;

  perform audit.id
  from private.media_object_storage_migration_audit audit
  where audit.table_name = v_legacy_table
    and audit.row_id = v_legacy_row_id
    and audit.status = 'updated'
    and lower(btrim(audit.new_storage_provider)) = v_provider
    and audit.new_storage_bucket = v_bucket
    and audit.new_storage_object_key = v_object_key
  for update;
  get diagnostics v_audit_count = row_count;

  if v_audit_count = 0 then
    return jsonb_build_object('revoked', false, 'reason', 'migration_provenance_required');
  end if;

  update private.media_object_storage_migration_audit audit
  set status = 'rolled_back',
      updated_at = transaction_timestamp()
  where audit.table_name = v_legacy_table
    and audit.row_id = v_legacy_row_id
    and audit.status = 'updated'
    and lower(btrim(audit.new_storage_provider)) = v_provider
    and audit.new_storage_bucket = v_bucket
    and audit.new_storage_object_key = v_object_key;

  insert into public.media_upload_reservations (
    owner_user_id,
    surface_type,
    storage_provider,
    storage_bucket,
    storage_object_key,
    expected_mime_type,
    expected_size_bytes,
    status,
    expires_at,
    attached_record_id,
    attached_at,
    deleted_at,
    updated_at
  ) values (
    p_owner_user_id,
    v_surface_type,
    v_provider,
    v_bucket,
    v_object_key,
    'application/octet-stream',
    1,
    'deleted',
    transaction_timestamp(),
    v_record_id,
    transaction_timestamp(),
    transaction_timestamp(),
    transaction_timestamp()
  );

  return jsonb_build_object(
    'revoked', true,
    'source', 'migration_audit',
    'alreadyDeleted', false
  );
exception
  when unique_violation then
    return jsonb_build_object('revoked', false, 'reason', 'concurrent_provenance_conflict');
end;
$$;

revoke all on function public.revoke_media_object_delivery(
  text, text, text, text, uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.revoke_media_object_delivery(
  text, text, text, text, uuid, text, text, text
) to service_role;

comment on function public.revoke_media_object_delivery(
  text, text, text, text, uuid, text, text, text
) is
  'Service-only exact media delivery revocation. It tombstones verified upload or bounded migration provenance before provider deletion so stale presigned uploads cannot restore authority.';

-- A creator-video cover is a distinct object from its source video.  Source
-- scan evidence must never authorize cover bytes, so covers keep their own
-- scanner-owned state and exact queue identity.
alter table public.videos
  add column if not exists thumb_scan_status text not null default 'manual_review',
  add column if not exists thumb_scan_provider text,
  add column if not exists thumb_scan_result text,
  add column if not exists thumb_scanned_at timestamptz,
  add column if not exists thumb_scan_error text,
  add column if not exists thumb_quarantined_at timestamptz;

alter table public.videos
  drop constraint if exists videos_thumb_scan_status_check;
alter table public.videos
  add constraint videos_thumb_scan_status_check check (thumb_scan_status in (
    'pending_scan',
    'scanning',
    'clean',
    'malware_detected',
    'scan_failed',
    'manual_review',
    'quarantined'
  ));

-- This helper is called from Storage RLS. A completed or pending scan job is
-- durable proof that a key has already represented bytes; clients must use a
-- fresh key instead of replacing bytes behind old clean evidence.
create or replace function public.media_scan_storage_key_available(
  p_bucket text,
  p_object_key text,
  p_owner_user_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth.uid() is not null
    and nullif(btrim(coalesce(p_owner_user_id, '')), '') = auth.uid()::text
    and split_part(nullif(btrim(coalesce(p_object_key, '')), ''), '/', 1) = auth.uid()::text
    and nullif(btrim(coalesce(p_bucket, '')), '') is not null
    and not exists (
      select 1
      from public.media_scan_jobs job
      where job.storage_bucket = btrim(p_bucket)
        and job.storage_object_key = btrim(p_object_key)
    );
$$;

revoke all on function public.media_scan_storage_key_available(text, text, text) from public, anon;
grant execute on function public.media_scan_storage_key_available(text, text, text) to authenticated, service_role;

create or replace function public.media_storage_object_owned(
  p_bucket text,
  p_object_key text,
  p_owner_user_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth.uid() is not null
    and auth.uid()::text = nullif(btrim(coalesce(p_owner_user_id, '')), '')
    and split_part(btrim(coalesce(p_object_key, '')), '/', 1) = auth.uid()::text
    and exists (
      select 1
      from storage.objects object
      where object.bucket_id = btrim(coalesce(p_bucket, ''))
        and object.name = btrim(coalesce(p_object_key, ''))
    );
$$;

revoke all on function public.media_storage_object_owned(text, text, text) from public, anon;
grant execute on function public.media_storage_object_owned(text, text, text)
  to authenticated, service_role;

drop policy if exists creator_videos_storage_owner_insert on storage.objects;
create policy creator_videos_storage_owner_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'creator-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.has_active_premium_creator_tool_access(auth.uid()::text)
    and public.media_scan_storage_key_available(bucket_id, name, auth.uid()::text)
  );

drop policy if exists creator_videos_storage_owner_update on storage.objects;

drop policy if exists social_attachments_storage_owner_insert on storage.objects;
create policy social_attachments_storage_owner_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'social-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.media_scan_storage_key_available(bucket_id, name, auth.uid()::text)
  );

drop policy if exists social_attachments_storage_owner_update on storage.objects;

drop policy if exists platform_brand_storage_insert_owner_prefix on storage.objects;
create policy platform_brand_storage_insert_owner_prefix
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'platform-brand-assets'
    and split_part(name, '/', 1) = auth.uid()::text
    and public.has_active_premium_creator_tool_access(auth.uid()::text)
    and public.media_scan_storage_key_available(bucket_id, name, auth.uid()::text)
  );

drop policy if exists platform_brand_storage_update_owner_prefix on storage.objects;

-- Exact provider/bucket/key provenance for creator video source rows. The only
-- non-owner-prefixed exception is a row proven by the private R2 migration
-- audit; ordinary clients cannot create that audit evidence.
create or replace function public.creator_video_storage_provenance_valid(
  p_video_id text,
  p_owner_user_id text,
  p_storage_provider text,
  p_storage_bucket text,
  p_storage_object_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with normalized as (
    select
      nullif(btrim(coalesce(p_video_id, '')), '') as video_id,
      nullif(btrim(coalesce(p_owner_user_id, '')), '') as owner_user_id,
      lower(btrim(coalesce(p_storage_provider, ''))) as provider,
      btrim(coalesce(p_storage_bucket, '')) as bucket,
      btrim(coalesce(p_storage_object_key, '')) as object_key
  )
  select
    n.video_id is not null
    and n.owner_user_id is not null
    and n.object_key <> ''
    and n.object_key not like '/%'
    and n.object_key not like '%..%'
    and (
      (
        (
          (n.provider = 'supabase' and n.bucket = 'creator-videos')
          or (n.provider = 's3' and n.bucket = 'chillywood-media-prod')
          or (n.provider = 'cloudflare_r2' and n.bucket = 'chillywood-media-origin')
        )
        and split_part(n.object_key, '/', 1) = n.owner_user_id
      )
      or (
        n.provider = 'cloudflare_r2'
        and n.bucket = 'chillywood-media-origin'
        and exists (
          select 1
          from private.media_object_storage_migration_audit audit
          where audit.table_name = 'videos'
            and audit.row_id = n.video_id
            and audit.status = 'updated'
            and audit.new_storage_provider = n.provider
            and audit.new_storage_bucket = n.bucket
            and audit.new_storage_object_key = n.object_key
        )
      )
    )
  from normalized n;
$$;

revoke all on function public.creator_video_storage_provenance_valid(text, text, text, text, text)
  from public, anon;
grant execute on function public.creator_video_storage_provenance_valid(text, text, text, text, text)
  to authenticated, service_role;

create or replace function public.guard_creator_video_client_authority()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_key text := btrim(coalesce(nullif(new.storage_object_key, ''), new.storage_path, ''));
  v_trusted boolean := current_user in ('postgres', 'service_role', 'supabase_admin')
    or coalesce(auth.role(), '') = 'service_role';
begin
  if tg_op = 'INSERT' then
    if not public.creator_video_storage_provenance_valid(
      new.id::text,
      new.owner_id::text,
      new.storage_provider,
      new.storage_bucket,
      v_key
    ) then
      raise exception using errcode = '42501', message = 'creator_video_storage_provenance_invalid';
    end if;
    if not v_trusted and (
      new.owner_id is distinct from auth.uid()
      or v_key not like auth.uid()::text || '/' || new.id::text || '/source.%'
      or nullif(btrim(coalesce(new.playback_url, '')), '') is not null
      or nullif(btrim(coalesce(new.thumb_url, '')), '') is not null
      or nullif(btrim(coalesce(new.thumb_storage_path, '')), '') is not null
    ) then
      raise exception using errcode = '42501', message = 'creator_video_client_source_identity_invalid';
    end if;
    if not v_trusted
      and lower(btrim(coalesce(new.storage_provider, ''))) in ('s3', 'cloudflare_r2')
      and (new.file_size_bytes is null or new.file_size_bytes <= 0)
    then
      raise exception using errcode = '42501', message = 'creator_video_verified_upload_required';
    end if;
    if not v_trusted
      and lower(btrim(coalesce(new.storage_provider, ''))) in ('s3', 'cloudflare_r2')
      and not public.consume_verified_media_upload(
        'creator_video',
        new.storage_provider,
        new.storage_bucket,
        v_key,
        new.mime_type,
        new.file_size_bytes,
        new.id::text
      )
    then
      raise exception using errcode = '42501', message = 'creator_video_verified_upload_required';
    end if;
    if not v_trusted
      and lower(btrim(coalesce(new.storage_provider, ''))) = 'supabase'
      and not public.media_storage_object_owned(new.storage_bucket, v_key, new.owner_id::text)
    then
      raise exception using errcode = '42501', message = 'creator_video_uploaded_object_required';
    end if;
    new.storage_object_key := v_key;
    new.storage_path := v_key;
    if new.thumb_storage_path is null then
      new.thumb_scan_status := 'manual_review';
    else
      new.thumb_scan_status := 'pending_scan';
    end if;
    new.thumb_scan_provider := 'clamav';
    new.thumb_scan_result := null;
    new.thumb_scanned_at := null;
    new.thumb_scan_error := null;
    new.thumb_quarantined_at := null;
    return new;
  end if;

  if not v_trusted then
    if new.id is distinct from old.id
      or new.owner_id is distinct from old.owner_id
      or new.storage_provider is distinct from old.storage_provider
      or new.storage_bucket is distinct from old.storage_bucket
      or new.storage_object_key is distinct from old.storage_object_key
      or new.storage_path is distinct from old.storage_path
      or new.playback_url is distinct from old.playback_url
      or new.mime_type is distinct from old.mime_type
      or new.file_size_bytes is distinct from old.file_size_bytes
      or new.scan_status is distinct from old.scan_status
      or new.scan_provider is distinct from old.scan_provider
      or new.scan_result is distinct from old.scan_result
      or new.scanned_at is distinct from old.scanned_at
      or new.scan_error is distinct from old.scan_error
      or new.quarantined_at is distinct from old.quarantined_at
      or (
        new.thumb_storage_path is not distinct from old.thumb_storage_path
        and (
          new.thumb_scan_status is distinct from old.thumb_scan_status
          or new.thumb_scan_provider is distinct from old.thumb_scan_provider
          or new.thumb_scan_result is distinct from old.thumb_scan_result
          or new.thumb_scanned_at is distinct from old.thumb_scanned_at
          or new.thumb_scan_error is distinct from old.thumb_scan_error
          or new.thumb_quarantined_at is distinct from old.thumb_quarantined_at
        )
      )
    then
      raise exception using errcode = '42501', message = 'creator_video_authority_fields_server_owned';
    end if;

    if new.thumb_storage_path is distinct from old.thumb_storage_path then
      if new.thumb_storage_path is not null and (
        new.thumb_storage_path not like new.owner_id::text || '/' || new.id::text || '/cover-%'
        or new.thumb_storage_path like '%..%'
        or nullif(btrim(coalesce(new.thumb_url, '')), '') is not null
      ) then
        raise exception using errcode = '42501', message = 'creator_video_thumbnail_provenance_invalid';
      end if;
      if new.thumb_storage_path is not null
        and lower(btrim(coalesce(new.storage_provider, ''))) in ('s3', 'cloudflare_r2')
        and not public.consume_verified_media_upload(
          'creator_video',
          new.storage_provider,
          new.storage_bucket,
          new.thumb_storage_path,
          null,
          null,
          new.id::text
        )
      then
        raise exception using errcode = '42501', message = 'creator_video_thumbnail_verified_upload_required';
      end if;
      if new.thumb_storage_path is null then
        new.thumb_scan_status := 'manual_review';
      else
        new.thumb_scan_status := 'pending_scan';
      end if;
      new.thumb_scan_provider := 'clamav';
      new.thumb_scan_result := null;
      new.thumb_scanned_at := null;
      new.thumb_scan_error := null;
      new.thumb_quarantined_at := null;
    elsif new.thumb_url is distinct from old.thumb_url then
      raise exception using errcode = '42501', message = 'creator_video_thumbnail_url_server_owned';
    end if;
  end if;

  if v_trusted and new.thumb_storage_path is distinct from old.thumb_storage_path then
    if new.thumb_storage_path is null then
      new.thumb_scan_status := 'manual_review';
    else
      new.thumb_scan_status := 'pending_scan';
    end if;
    new.thumb_scan_provider := 'clamav';
    new.thumb_scan_result := null;
    new.thumb_scanned_at := null;
    new.thumb_scan_error := null;
    new.thumb_quarantined_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists zz_guard_creator_video_client_authority on public.videos;
create trigger zz_guard_creator_video_client_authority
  before insert or update on public.videos
  for each row execute function public.guard_creator_video_client_authority();

create or replace function public.enqueue_creator_video_thumbnail_scan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.thumb_storage_path is not null
    and new.thumb_scan_status = 'pending_scan'
    and (
      tg_op = 'INSERT'
      or new.thumb_storage_path is distinct from old.thumb_storage_path
      or new.thumb_scan_status is distinct from old.thumb_scan_status
    )
  then
    perform public.enqueue_media_scan_job(
      'videos',
      'thumbnail',
      new.id::text,
      new.owner_id::text,
      new.storage_provider,
      new.storage_bucket,
      new.thumb_storage_path,
      'image/*',
      0,
      15,
      jsonb_build_object('videoId', new.id, 'objectKind', 'thumbnail')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists enqueue_creator_video_thumbnail_scan_after on public.videos;
create trigger enqueue_creator_video_thumbnail_scan_after
  after insert or update on public.videos
  for each row execute function public.enqueue_creator_video_thumbnail_scan();

drop trigger if exists project_creator_video_thumbnail_scan_result_after on public.media_scan_jobs;
drop function if exists public.project_creator_video_thumbnail_scan_result();

revoke all on function public.enqueue_creator_video_thumbnail_scan() from public, anon, authenticated;

create or replace function public.enqueue_video_scan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.scan_status = 'pending_scan'
    and nullif(btrim(coalesce(new.storage_object_key, new.storage_path, '')), '') is not null
    and (
      tg_op = 'INSERT'
      or coalesce(new.storage_object_key, new.storage_path)
        is distinct from coalesce(old.storage_object_key, old.storage_path)
      or new.scan_status is distinct from old.scan_status
    )
  then
    perform public.enqueue_media_scan_job(
      'videos',
      'source',
      new.id::text,
      new.owner_id::text,
      coalesce(new.storage_provider, 'supabase'),
      coalesce(new.storage_bucket, 'creator-videos'),
      coalesce(nullif(new.storage_object_key, ''), new.storage_path),
      new.mime_type,
      coalesce(new.file_size_bytes, 0),
      10,
      jsonb_build_object('title', new.title)
    );
  end if;
  return new;
end;
$$;

revoke all on function public.enqueue_video_scan() from public, anon, authenticated;

-- Extend the durable scanner's internal target-propagation path instead of
-- coupling target updates to a generic job-table trigger. The public wrapper
-- keeps its subtransaction fallback: a mismatched/stale target records the job
-- outcome but can never mark a cover clean.
do $$
begin
  if to_regprocedure(
    'public.complete_media_scan_job_with_target_propagation_legacy(uuid,text,text,text,text,text,text,integer)'
  ) is null then
    alter function public.complete_media_scan_job_with_target_propagation(
      uuid, text, text, text, text, text, text, integer
    ) rename to complete_media_scan_job_with_target_propagation_legacy;
  end if;
end;
$$;

create or replace function public.complete_media_scan_job_with_target_propagation(
  p_job_id uuid,
  p_status text,
  p_scanner_provider text default 'clamav',
  p_scanner_version text default null,
  p_signature_version text default null,
  p_finding_name text default null,
  p_error_message text default null,
  p_duration_ms integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.media_scan_jobs%rowtype;
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_now timestamptz := transaction_timestamp();
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception 'media_scan_service_role_required';
  end if;
  if v_status not in ('clean', 'malware_detected', 'scan_failed', 'manual_review', 'quarantined') then
    raise exception 'media_scan_result_status_invalid';
  end if;

  select * into v_job
  from public.media_scan_jobs job
  where job.id = p_job_id
  for update;
  if not found then raise exception 'media_scan_job_not_found'; end if;

  if v_job.target_table <> 'videos' or v_job.target_column <> 'thumbnail' then
    return public.complete_media_scan_job_with_target_propagation_legacy(
      p_job_id,
      v_status,
      p_scanner_provider,
      p_scanner_version,
      p_signature_version,
      p_finding_name,
      p_error_message,
      p_duration_ms
    );
  end if;

  update public.videos video
  set thumb_scan_status = v_status,
      thumb_scan_provider = nullif(btrim(coalesce(p_scanner_provider, '')), ''),
      thumb_scan_result = coalesce(nullif(btrim(coalesce(p_finding_name, '')), ''), v_status),
      thumb_scanned_at = case when v_status <> 'scan_failed' then v_now else video.thumb_scanned_at end,
      thumb_scan_error = nullif(btrim(coalesce(p_error_message, '')), ''),
      thumb_quarantined_at = case
        when v_status in ('malware_detected', 'quarantined') then v_now
        else video.thumb_quarantined_at
      end,
      updated_at = v_now
  where video.id::text = v_job.target_id
    and lower(btrim(coalesce(video.storage_provider, ''))) = lower(btrim(v_job.storage_provider))
    and video.storage_bucket = v_job.storage_bucket
    and video.thumb_storage_path = v_job.storage_object_key;
  if not found then raise exception 'media_scan_thumbnail_target_mismatch'; end if;

  update public.media_scan_jobs job
  set status = v_status,
      completed_at = case when v_status = 'scan_failed' then null else v_now end,
      scanner_provider = nullif(btrim(coalesce(p_scanner_provider, '')), ''),
      scanner_version = nullif(btrim(coalesce(p_scanner_version, '')), ''),
      signature_version = nullif(btrim(coalesce(p_signature_version, '')), ''),
      finding_name = nullif(btrim(coalesce(p_finding_name, '')), ''),
      error_message = nullif(btrim(coalesce(p_error_message, '')), ''),
      metadata = coalesce(job.metadata, '{}'::jsonb) || jsonb_build_object(
        'durationMs', p_duration_ms,
        'completedAt', v_now,
        'targetPropagationComplete', true
      ),
      updated_at = v_now
  where job.id = v_job.id;

  return jsonb_build_object(
    'status', v_status,
    'jobId', v_job.id,
    'targetTable', v_job.target_table,
    'targetId', v_job.target_id
  );
end;
$$;

revoke all on function public.complete_media_scan_job_with_target_propagation(
  uuid, text, text, text, text, text, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.complete_media_scan_job_with_target_propagation_legacy(
  uuid, text, text, text, text, text, text, integer
) from public, anon, authenticated, service_role;

-- Paid creator-content access is derived only from the current exact grant.
-- The historical boolean bridge is not authoritative because its row does not
-- expire when the underlying grant reaches expires_at without another write.
create or replace function public.resolve_creator_content_access(
  p_content_type text,
  p_content_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_creator_id uuid;
  v_price public.creator_content_prices%rowtype;
  v_grant jsonb;
begin
  if p_content_type <> 'creator_video' then
    return jsonb_build_object('allowed', false, 'reason', 'unsupported_content_type', 'requiresPurchase', true);
  end if;

  select video.owner_id
  into v_creator_id
  from public.videos video
  where video.id = p_content_id
    and (
      video.owner_id = v_viewer_id
      or public.has_platform_role(array['owner'::text, 'operator'::text])
      or (
        video.visibility = 'public'
        and video.moderation_status in ('clean', 'reported')
        and public.media_scan_public_safe(video.scan_status)
      )
    );

  if v_creator_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'content_unavailable', 'requiresPurchase', true);
  end if;

  if v_viewer_id is not null and v_viewer_id = v_creator_id then
    return jsonb_build_object('allowed', true, 'reason', 'owner', 'requiresPurchase', false);
  end if;

  select *
  into v_price
  from public.creator_content_prices price
  where price.content_type = p_content_type
    and price.content_id = p_content_id
    and price.status in ('sandbox', 'active')
    and price.is_paid = true
  order by price.updated_at desc, price.created_at desc
  limit 1;

  if v_price.id is null then
    return jsonb_build_object('allowed', true, 'reason', 'free_content', 'requiresPurchase', false);
  end if;

  if v_viewer_id is not null then
    v_grant := public.has_access_grant('paid_content_access', p_content_id, v_viewer_id);
    if coalesce((v_grant->>'allowed')::boolean, false)
      and coalesce(v_grant->>'reason', '') in ('active_grant', 'sandbox_grant')
    then
      return jsonb_build_object(
        'allowed', true,
        'reason', v_grant->>'reason',
        'requiresPurchase', false,
        'environment', coalesce(v_grant->>'environment', 'unknown')
      );
    end if;
  end if;

  return jsonb_build_object(
    'allowed', false,
    'reason', 'purchase_required',
    'requiresPurchase', true,
    'priceCents', v_price.price_cents,
    'currency', v_price.currency,
    'creatorId', v_creator_id,
    'provider', v_price.provider,
    'providerProductId', v_price.provider_product_id,
    'providerProductKey', v_price.provider_product_key,
    'offerStatus', v_price.status
  );
exception when others then
  return jsonb_build_object('allowed', false, 'reason', 'access_resolution_failed', 'requiresPurchase', true);
end;
$$;

revoke all on function public.resolve_creator_content_access(text, uuid) from public;
grant execute on function public.resolve_creator_content_access(text, uuid) to anon, authenticated;

create or replace function public.creator_video_commerce_access_allowed(p_video_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_paid boolean := false;
  v_resolution jsonb;
begin
  select exists (
    select 1
    from public.creator_content_prices price
    where price.content_type = 'creator_video'
      and price.content_id = p_video_id
      and price.status in ('sandbox', 'active')
      and price.is_paid = true
  ) into v_paid;

  if not v_paid then return true; end if;
  v_resolution := public.resolve_creator_content_access('creator_video', p_video_id);
  return coalesce((v_resolution->>'allowed')::boolean, false);
exception when others then
  return false;
end;
$$;

revoke all on function public.creator_video_commerce_access_allowed(uuid) from public;
grant execute on function public.creator_video_commerce_access_allowed(uuid)
  to anon, authenticated, service_role;

-- Supabase-origin legacy objects must enforce the same current authority as
-- the private R2/S3 gateway. Paid source bytes require exact current commerce
-- access; a cover is a preview but still requires its own exact clean scan.
drop policy if exists creator_videos_storage_select_visibility_access on storage.objects;
create policy creator_videos_storage_select_visibility_access
  on storage.objects
  for select
  to public
  using (
    bucket_id = 'creator-videos'
    and (
      (auth.uid() is not null and split_part(name, '/', 1) = auth.uid()::text)
      or exists (
        select 1
        from public.videos video
        where lower(btrim(coalesce(video.storage_provider, ''))) = 'supabase'
          and video.storage_bucket = storage.objects.bucket_id
          and public.can_read_creator_video_row(
          video.owner_id::text,
          video.visibility,
          video.moderation_status,
          video.scan_status,
          video.storage_path,
          video.storage_object_key,
          video.playback_url,
          auth.uid()::text
        )
          and (
            (
              (
                video.storage_path = storage.objects.name
                or video.storage_object_key = storage.objects.name
                or video.playback_url = storage.objects.name
              )
              and public.creator_video_commerce_access_allowed(video.id)
            )
            or (
              video.thumb_storage_path = storage.objects.name
              and exists (
                select 1
                from public.media_scan_jobs cover_job
                where cover_job.target_table = 'videos'
                  and cover_job.target_column = 'thumbnail'
                  and cover_job.target_id = video.id::text
                  and cover_job.storage_bucket = storage.objects.bucket_id
                  and cover_job.storage_object_key = storage.objects.name
                  and cover_job.status = 'clean'
              )
            )
          )
      )
    )
  );

drop policy if exists creator_videos_storage_select_free_renditions on storage.objects;
create policy creator_videos_storage_select_free_renditions
  on storage.objects
  for select
  to public
  using (
    bucket_id = 'creator-videos'
    and exists (
      select 1
      from public.video_renditions rendition
      join public.videos video on video.id = rendition.video_id
      where rendition.storage_bucket = storage.objects.bucket_id
        and (
          rendition.storage_path = storage.objects.name
          or rendition.manifest_path = storage.objects.name
        )
        and rendition.status = 'ready'
        and rendition.quality_label <> 'original'
        and rendition.access_tier = 'free'
        and public.media_scan_public_safe(video.scan_status)
        and public.media_scan_public_safe(rendition.scan_status)
        and public.can_read_creator_video_row(
          video.owner_id::text,
          video.visibility,
          video.moderation_status,
          video.scan_status,
          video.storage_path,
          video.storage_object_key,
          video.playback_url,
          auth.uid()::text
        )
        and public.creator_video_commerce_access_allowed(video.id)
    )
  );

drop policy if exists creator_videos_storage_select_premium_renditions on storage.objects;
create policy creator_videos_storage_select_premium_renditions
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'creator-videos'
    and exists (
      select 1
      from public.video_renditions rendition
      join public.videos video on video.id = rendition.video_id
      where rendition.storage_bucket = storage.objects.bucket_id
        and (
          rendition.storage_path = storage.objects.name
          or rendition.manifest_path = storage.objects.name
        )
        and rendition.status = 'ready'
        and rendition.quality_label <> 'original'
        and rendition.access_tier = 'premium'
        and public.media_scan_public_safe(video.scan_status)
        and public.media_scan_public_safe(rendition.scan_status)
        and public.can_read_creator_video_row(
          video.owner_id::text,
          video.visibility,
          video.moderation_status,
          video.scan_status,
          video.storage_path,
          video.storage_object_key,
          video.playback_url,
          auth.uid()::text
        )
        and public.user_has_active_entitlement(auth.uid()::text, array['premium'::text])
        and public.creator_video_commerce_access_allowed(video.id)
    )
  );

-- The scanner writes the target row through service_role.  Preserve the
-- operator-only moderation boundary while allowing that trusted execution
-- context to quarantine malware; ordinary authenticated callers remain bound
-- to the exact platform-role check.
create or replace function public.protect_creator_video_moderation_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    old.moderation_status is distinct from new.moderation_status
    or old.moderated_at is distinct from new.moderated_at
    or old.moderated_by is distinct from new.moderated_by
    or old.moderation_reason is distinct from new.moderation_reason
  )
  and coalesce(auth.role(), '') <> 'service_role'
  and session_user not in ('postgres', 'service_role', 'supabase_admin')
  and not public.has_platform_role(array['owner'::text, 'operator'::text])
  then
    raise exception using errcode = '42501',
      message = 'creator_video_moderation_authority_required';
  end if;

  return new;
end;
$$;

-- These are trusted, one-time security reductions for existing rows. The
-- ordinary account-access trigger rejects every write owned by a restricted
-- account, including platform-authored quarantine. Disable only that named
-- trigger for the two cutover updates; ALTER TABLE holds the table lock until
-- this migration transaction restores it, while every other integrity trigger
-- remains active.
begin;
alter table public.videos
  disable trigger "enforce_videos_account_access_guard";

-- Existing rows that cannot prove source ownership are quarantined rather than
-- silently grandfathered into public delivery.
update public.videos video
set scan_status = 'quarantined',
    scan_result = 'storage_provenance_unverified',
    scan_error = 'storage_provenance_unverified',
    quarantined_at = coalesce(video.quarantined_at, now()),
    updated_at = now()
where not public.creator_video_storage_provenance_valid(
  video.id::text,
  video.owner_id::text,
  video.storage_provider,
  video.storage_bucket,
  coalesce(nullif(video.storage_object_key, ''), video.storage_path)
);

-- Legacy thumb_url values were client supplied and have no object-version scan
-- binding.  They cannot remain a public fallback.  Exact stored covers are
-- rescanned under their own queue identity before public delivery.
update public.videos video
set thumb_url = null,
    thumb_storage_path = case
      when video.thumb_storage_path like video.owner_id::text || '/' || video.id::text || '/cover-%'
        and video.thumb_storage_path not like '%..%'
      then video.thumb_storage_path
      else null
    end,
    thumb_scan_status = case
      when video.thumb_storage_path like video.owner_id::text || '/' || video.id::text || '/cover-%'
        and video.thumb_storage_path not like '%..%'
      then 'pending_scan'
      else 'manual_review'
    end,
    thumb_scan_provider = 'clamav',
    thumb_scan_result = null,
    thumb_scanned_at = null,
    thumb_scan_error = null,
    thumb_quarantined_at = null,
    updated_at = transaction_timestamp()
where video.thumb_url is not null
   or video.thumb_storage_path is not null;

alter table public.videos
  enable trigger "enforce_videos_account_access_guard";
commit;

-- The social metadata policy had schema support for R2 but omitted the exact
-- private-origin provider/bucket pair, causing every current-origin attachment
-- insert to fail after the bytes were uploaded.
drop policy if exists social_attachments_insert_own_surface on public.social_attachments;
create policy social_attachments_insert_own_surface
  on public.social_attachments
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and owner_user_id = auth.uid()::text
    and (
      (storage_provider = 'supabase' and storage_bucket = 'social-attachments')
      or (storage_provider = 's3' and storage_bucket = 'chillywood-media-prod')
      or (storage_provider = 'cloudflare_r2' and storage_bucket = 'chillywood-media-origin')
    )
    and split_part(coalesce(nullif(storage_object_key, ''), storage_path), '/', 1) = auth.uid()::text
    and deleted_at is null
    and moderation_status = 'clean'
    and size_bytes <= 262144000
    and (
      (
        surface_type = 'profile_post'
        and exists (
          select 1 from public.profile_posts post
          where post.id = social_attachments.surface_id
            and post.user_id = auth.uid()::text
            and post.deleted_at is null
            and public.can_view_profile_content(post.user_id)
        )
      )
      or (
        surface_type = 'profile_post_comment'
        and exists (
          select 1
          from public.profile_post_comments comment
          join public.profile_posts post on post.id = comment.post_id
          where comment.id = social_attachments.surface_id
            and comment.user_id = auth.uid()::text
            and comment.deleted_at is null
            and public.can_view_profile_content(post.user_id)
        )
      )
      or (
        surface_type = 'creator_video_comment'
        and exists (
          select 1 from public.creator_video_comments comment
          where comment.id = social_attachments.surface_id
            and comment.user_id = auth.uid()::text
            and comment.deleted_at is null
        )
      )
      or (
        surface_type = 'chat_message'
        and exists (
          select 1 from public.chat_messages message
          where message.id = social_attachments.surface_id
            and message.sender_user_id = auth.uid()::text
            and public.can_access_chat_thread(message.thread_id)
        )
      )
      or (
        surface_type = 'watch_party_room_message'
        and exists (
          select 1 from public.watch_party_room_messages message
          where message.id = social_attachments.surface_id
            and message.user_id = auth.uid()::text
        )
      )
    )
  );

create or replace function public.guard_social_attachment_client_authority()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_trusted boolean := current_user in ('postgres', 'service_role', 'supabase_admin')
    or coalesce(auth.role(), '') = 'service_role';
begin
  if tg_op = 'INSERT' and not v_trusted
    and lower(btrim(coalesce(new.storage_provider, ''))) in ('s3', 'cloudflare_r2')
    and not public.consume_verified_media_upload(
      'social_attachment',
      new.storage_provider,
      new.storage_bucket,
      coalesce(nullif(new.storage_object_key, ''), new.storage_path),
      new.mime_type,
      new.size_bytes,
      new.id::text
    )
  then
    raise exception using errcode = '42501', message = 'social_attachment_verified_upload_required';
  end if;
  if tg_op = 'INSERT' and not v_trusted
    and lower(btrim(coalesce(new.storage_provider, ''))) = 'supabase'
    and not public.media_storage_object_owned(
      new.storage_bucket,
      coalesce(nullif(new.storage_object_key, ''), new.storage_path),
      new.owner_user_id
    )
  then
    raise exception using errcode = '42501', message = 'social_attachment_uploaded_object_required';
  end if;

  if tg_op = 'UPDATE' and not v_trusted and (
    new.id is distinct from old.id
    or new.owner_user_id is distinct from old.owner_user_id
    or new.surface_type is distinct from old.surface_type
    or new.surface_id is distinct from old.surface_id
    or new.storage_provider is distinct from old.storage_provider
    or new.storage_bucket is distinct from old.storage_bucket
    or new.storage_object_key is distinct from old.storage_object_key
    or new.storage_path is distinct from old.storage_path
    or new.scan_status is distinct from old.scan_status
    or new.scan_provider is distinct from old.scan_provider
    or new.scan_result is distinct from old.scan_result
    or new.scanned_at is distinct from old.scanned_at
    or new.scan_error is distinct from old.scan_error
    or new.quarantined_at is distinct from old.quarantined_at
  ) then
    raise exception using errcode = '42501', message = 'social_attachment_authority_fields_server_owned';
  end if;
  return new;
end;
$$;

drop trigger if exists zz_guard_social_attachment_client_authority on public.social_attachments;
create trigger zz_guard_social_attachment_client_authority
  before insert or update on public.social_attachments
  for each row execute function public.guard_social_attachment_client_authority();

-- Brand Studio scan evidence is also server-owned. Manual review is an
-- operator workflow state, not a malware-clean publication state.
create or replace function public.guard_platform_brand_asset_client_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_review_context text := coalesce(current_setting('app.platform_brand_review_context', true), '');
begin
  if new.asset_state = 'published' and not public.media_scan_public_safe(new.scan_status) then
    raise exception using errcode = '42501', message = 'platform_brand_asset_malware_clean_required';
  end if;

  if auth.role() = 'authenticated' and v_review_context <> 'review_platform_brand_asset' then
    if new.owner_user_id is distinct from old.owner_user_id
      or new.asset_type is distinct from old.asset_type
      or new.storage_provider is distinct from old.storage_provider
      or new.storage_bucket is distinct from old.storage_bucket
      or new.storage_object_key is distinct from old.storage_object_key
      or new.storage_path is distinct from old.storage_path
      or new.mime_type is distinct from old.mime_type
      or new.width is distinct from old.width
      or new.height is distinct from old.height
      or new.duration_ms is distinct from old.duration_ms
      or new.file_size_bytes is distinct from old.file_size_bytes
      or new.original_file_name is distinct from old.original_file_name
      or new.moderation_status is distinct from old.moderation_status
      or new.moderation_reason is distinct from old.moderation_reason
      or new.moderated_at is distinct from old.moderated_at
      or new.moderated_by is distinct from old.moderated_by
      or new.scan_status is distinct from old.scan_status
      or new.scan_provider is distinct from old.scan_provider
      or new.scan_result is distinct from old.scan_result
      or new.scanned_at is distinct from old.scanned_at
      or new.scan_error is distinct from old.scan_error
      or new.quarantined_at is distinct from old.quarantined_at
    then
      raise exception using errcode = '42501', message = 'platform_brand_asset_authority_fields_server_owned';
    end if;
  end if;
  return new;
end;
$$;

update public.platform_brand_assets
set asset_state = 'draft', updated_at = now()
where asset_state = 'published'
  and not public.media_scan_public_safe(scan_status);

alter table public.platform_brand_assets
  drop constraint if exists platform_brand_assets_published_malware_clean_check;
alter table public.platform_brand_assets
  add constraint platform_brand_assets_published_malware_clean_check
  check (asset_state <> 'published' or public.media_scan_public_safe(scan_status));

-- Profile objects are private. The public URL is now an Edge proxy that checks
-- the current profile row and clean scan state before streaming the object.
update storage.buckets
set public = false
where id = 'profile-media';

drop policy if exists profile_media_storage_select_public on storage.objects;
drop policy if exists profile_media_storage_select_owner on storage.objects;
create policy profile_media_storage_select_owner
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'profile-media'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists profile_media_storage_insert_owner_prefix on storage.objects;
create policy profile_media_storage_insert_owner_prefix
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'profile-media'
    and split_part(name, '/', 1) = auth.uid()::text
    and public.media_scan_storage_key_available(bucket_id, name, auth.uid()::text)
  );

drop policy if exists profile_media_storage_update_owner_prefix on storage.objects;

create or replace function public.profile_media_public_origin()
returns text
language sql
immutable
set search_path = ''
as $$
  select 'https://bmkkhihfbmsnnmcqkoly.supabase.co'::text;
$$;

create or replace function public.profile_media_public_url(p_owner_user_id text, p_object_key text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when nullif(btrim(coalesce(p_owner_user_id, '')), '') is null
      or nullif(btrim(coalesce(p_object_key, '')), '') is null
    then null
    else public.profile_media_public_origin()
      || '/functions/v1/profile-media-public?ownerUserId=' || btrim(p_owner_user_id)
      || '&objectKey=' || btrim(p_object_key)
  end;
$$;

revoke all on function public.profile_media_public_origin() from public, anon;
revoke all on function public.profile_media_public_url(text, text) from public, anon;
grant execute on function public.profile_media_public_origin() to authenticated, service_role;
grant execute on function public.profile_media_public_url(text, text) to authenticated, service_role;

-- Resolve one exact profile-media object against the viewer's current profile
-- visibility and the matching malware result in a single database snapshot.
-- A clean avatar result cannot authorize a background object (or vice versa),
-- and a URL alone is never delivery authority.
create or replace function public.resolve_profile_media_delivery(
  p_owner_user_id text,
  p_object_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner_user_id text := nullif(btrim(coalesce(p_owner_user_id, '')), '');
  v_object_key text := nullif(btrim(coalesce(p_object_key, '')), '');
  v_canonical_url text;
  v_profile public.user_profiles%rowtype;
  v_media_kind text;
  v_scan_status text;
begin
  if v_owner_user_id is null or v_object_key is null
    or length(v_owner_user_id) > 128 or length(v_object_key) > 1024
    or v_object_key like '%..%'
    or not (
      v_object_key like v_owner_user_id || '/avatar/%'
      or v_object_key like v_owner_user_id || '/background/%'
      or (
        v_owner_user_id = 'platform_rachi_official'
        and v_object_key like 'official/rachi/avatar/%'
      )
    )
  then
    return jsonb_build_object(
      'authoritative', true,
      'allowed', false,
      'reason', 'profile_media_identity_invalid'
    );
  end if;

  v_canonical_url := public.profile_media_public_url(v_owner_user_id, v_object_key);

  select profile.* into v_profile
  from public.user_profiles profile
  where profile.user_id = v_owner_user_id
    and not public.is_platform_owner_user(profile.user_id)
    and public.can_view_profile_content(profile.user_id)
  limit 1;

  if not found then
    return jsonb_build_object(
      'authoritative', true,
      'allowed', false,
      'reason', 'profile_media_not_visible',
      'ownerUserId', v_owner_user_id,
      'objectKey', v_object_key
    );
  end if;

  if v_profile.avatar_url = v_canonical_url then
    v_media_kind := 'avatar';
    v_scan_status := v_profile.profile_avatar_scan_status;
  elsif v_profile.profile_background_url = v_canonical_url then
    v_media_kind := 'background';
    v_scan_status := v_profile.profile_background_scan_status;
  else
    return jsonb_build_object(
      'authoritative', true,
      'allowed', false,
      'reason', 'profile_media_not_current',
      'ownerUserId', v_owner_user_id,
      'objectKey', v_object_key
    );
  end if;

  if not public.media_scan_public_safe(v_scan_status) then
    return jsonb_build_object(
      'authoritative', true,
      'allowed', false,
      'reason', 'profile_media_scan_blocked',
      'ownerUserId', v_owner_user_id,
      'objectKey', v_object_key,
      'mediaKind', v_media_kind,
      'scanStatus', coalesce(v_scan_status, 'unknown')
    );
  end if;

  return jsonb_build_object(
    'authoritative', true,
    'allowed', true,
    'reason', 'profile_media_exact_clean',
    'ownerUserId', v_owner_user_id,
    'objectKey', v_object_key,
    'mediaKind', v_media_kind,
    'scanStatus', 'clean'
  );
end;
$$;

revoke all on function public.resolve_profile_media_delivery(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_profile_media_delivery(text, text)
  to anon, authenticated, service_role;

create or replace function public.media_scan_object_key_from_public_url(bucket_name text, media_url text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_bucket text := btrim(coalesce(bucket_name, ''));
  v_url text := nullif(btrim(coalesce(media_url, '')), '');
  v_marker text;
  v_index integer;
  v_query text;
begin
  if v_bucket = '' or v_url is null then return null; end if;

  v_marker := public.profile_media_public_origin() || '/storage/v1/object/public/' || v_bucket || '/';
  if left(v_url, length(v_marker)) = v_marker then
    return nullif(split_part(substring(v_url from length(v_marker) + 1), '?', 1), '');
  end if;

  v_marker := public.profile_media_public_origin() || '/functions/v1/profile-media-public?';
  if v_bucket = 'profile-media' and left(v_url, length(v_marker)) = v_marker then
    v_query := split_part(v_url, '?', 2);
    return nullif(split_part(split_part(v_query, 'objectKey=', 2), '&', 1), '');
  end if;

  return null;
end;
$$;

revoke all on function public.media_scan_object_key_from_public_url(text, text) from public, anon;
grant execute on function public.media_scan_object_key_from_public_url(text, text) to authenticated, service_role;

create or replace function public.profile_media_storage_object_valid(
  p_owner_user_id text,
  p_object_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (
      auth.uid() is null
      or auth.uid()::text = btrim(coalesce(p_owner_user_id, ''))
      or (
        coalesce(current_setting('role', true), '') = 'service_role'
        and coalesce(auth.jwt() ->> 'role', '') = 'service_role'
      )
      or (
        btrim(coalesce(p_owner_user_id, '')) = 'platform_rachi_official'
        and public.has_platform_role(array['owner'::text, 'operator'::text])
      )
    )
    and (
      btrim(coalesce(p_object_key, '')) like btrim(coalesce(p_owner_user_id, '')) || '/avatar/%'
      or btrim(coalesce(p_object_key, '')) like btrim(coalesce(p_owner_user_id, '')) || '/background/%'
      or (
        btrim(coalesce(p_owner_user_id, '')) = 'platform_rachi_official'
        and btrim(coalesce(p_object_key, '')) like 'official/rachi/avatar/%'
      )
    )
    and btrim(coalesce(p_object_key, '')) not like '%..%'
    and exists (
      select 1
      from storage.objects object
      where object.bucket_id = 'profile-media'
        and object.name = btrim(p_object_key)
    );
$$;

revoke all on function public.profile_media_storage_object_valid(text, text) from public, anon;
grant execute on function public.profile_media_storage_object_valid(text, text)
  to authenticated, service_role;

create or replace function public.guard_profile_media_client_authority()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_trusted boolean := current_user in ('postgres', 'service_role', 'supabase_admin')
    or coalesce(auth.role(), '') = 'service_role';
  v_avatar_changed boolean := tg_op = 'INSERT' or new.avatar_url is distinct from old.avatar_url;
  v_background_changed boolean := tg_op = 'INSERT' or new.profile_background_url is distinct from old.profile_background_url;
  v_avatar_key text := public.media_scan_object_key_from_public_url('profile-media', new.avatar_url);
  v_background_key text := public.media_scan_object_key_from_public_url('profile-media', new.profile_background_url);
begin
  if not v_trusted and new.user_id is distinct from auth.uid()::text then
    raise exception using errcode = '42501', message = 'profile_media_owner_required';
  end if;

  if (
    tg_op = 'INSERT'
    and (
      new.profile_avatar_media_status not in ('active', 'user_removed')
      or new.profile_background_media_status not in ('active', 'user_removed')
    )
  ) or (
    tg_op = 'UPDATE'
    and (
      (
        new.profile_avatar_media_status is distinct from old.profile_avatar_media_status
        and (
          new.profile_avatar_media_status not in ('active', 'user_removed')
          or (new.profile_avatar_media_status = 'active' and not v_avatar_changed)
          or (new.profile_avatar_media_status = 'user_removed' and new.avatar_url is not null)
        )
      )
      or (
        new.profile_background_media_status is distinct from old.profile_background_media_status
        and (
          new.profile_background_media_status not in ('active', 'user_removed')
          or (new.profile_background_media_status = 'active' and not v_background_changed)
          or (new.profile_background_media_status = 'user_removed' and new.profile_background_url is not null)
        )
      )
    )
  ) then
    raise exception using errcode = '42501', message = 'profile_media_status_server_owned';
  end if;

  if new.avatar_url is not null then
    if v_avatar_key is null
      or not public.profile_media_storage_object_valid(new.user_id, v_avatar_key)
    then
      raise exception using errcode = '42501', message = 'profile_avatar_storage_provenance_invalid';
    end if;
    new.avatar_url := public.profile_media_public_url(new.user_id, v_avatar_key);
  end if;
  if new.profile_background_url is not null then
    if v_background_key is null
      or not public.profile_media_storage_object_valid(new.user_id, v_background_key)
    then
      raise exception using errcode = '42501', message = 'profile_background_storage_provenance_invalid';
    end if;
    new.profile_background_url := public.profile_media_public_url(new.user_id, v_background_key);
  end if;

  if v_avatar_changed then
    if new.avatar_url is not null and new.profile_avatar_scan_status <> 'pending_scan' then
      raise exception using errcode = '42501', message = 'profile_avatar_scan_pending_required';
    end if;
  elsif not v_trusted and (
    new.profile_avatar_scan_status is distinct from old.profile_avatar_scan_status
    or new.profile_avatar_scan_provider is distinct from old.profile_avatar_scan_provider
    or new.profile_avatar_scan_result is distinct from old.profile_avatar_scan_result
    or new.profile_avatar_scanned_at is distinct from old.profile_avatar_scanned_at
    or new.profile_avatar_scan_error is distinct from old.profile_avatar_scan_error
  ) then
    raise exception using errcode = '42501', message = 'profile_avatar_scan_fields_server_owned';
  end if;

  if v_background_changed then
    if new.profile_background_url is not null and new.profile_background_scan_status <> 'pending_scan' then
      raise exception using errcode = '42501', message = 'profile_background_scan_pending_required';
    end if;
  elsif not v_trusted and (
    new.profile_background_scan_status is distinct from old.profile_background_scan_status
    or new.profile_background_scan_provider is distinct from old.profile_background_scan_provider
    or new.profile_background_scan_result is distinct from old.profile_background_scan_result
    or new.profile_background_scanned_at is distinct from old.profile_background_scanned_at
    or new.profile_background_scan_error is distinct from old.profile_background_scan_error
  ) then
    raise exception using errcode = '42501', message = 'profile_background_scan_fields_server_owned';
  end if;

  return new;
end;
$$;

drop trigger if exists zz_guard_profile_media_client_authority on public.user_profiles;
create trigger zz_guard_profile_media_client_authority
  before insert or update on public.user_profiles
  for each row execute function public.guard_profile_media_client_authority();

-- Convert only exact current-project profile-media objects to the private
-- gated proxy. Unknown/external origins are removed, because a URL itself is
-- never scan or profile authority. Existing rows may have independently stale
-- avatar/background values, so the new runtime guard cannot validate either
-- field until both reductions finish. Disable only that newly-created guard in
-- one explicit transaction and restore it before the transaction is visible.
begin;
alter table public.user_profiles
  disable trigger "zz_guard_profile_media_client_authority";
update public.user_profiles
set avatar_url = case
      when public.profile_media_storage_object_valid(
        user_id,
        public.media_scan_object_key_from_public_url('profile-media', avatar_url)
      )
      then public.profile_media_public_url(
        user_id,
        public.media_scan_object_key_from_public_url('profile-media', avatar_url)
      )
      else null
    end,
    profile_avatar_media_status = case
      when public.profile_media_storage_object_valid(
        user_id,
        public.media_scan_object_key_from_public_url('profile-media', avatar_url)
      ) then profile_avatar_media_status
      else 'user_removed'
    end,
    updated_at = now()
where avatar_url is not null;

update public.user_profiles
set profile_background_url = case
      when public.profile_media_storage_object_valid(
        user_id,
        public.media_scan_object_key_from_public_url('profile-media', profile_background_url)
      )
      then public.profile_media_public_url(
        user_id,
        public.media_scan_object_key_from_public_url('profile-media', profile_background_url)
      )
      else null
    end,
    profile_background_media_status = case
      when public.profile_media_storage_object_valid(
        user_id,
        public.media_scan_object_key_from_public_url('profile-media', profile_background_url)
      ) then profile_background_media_status
      else 'user_removed'
    end,
    updated_at = now()
where profile_background_url is not null;

alter table public.user_profiles
  enable trigger "zz_guard_profile_media_client_authority";
commit;

alter table public.media_security_audit_events
  drop constraint if exists media_security_audit_events_action_check;
alter table public.media_security_audit_events
  add constraint media_security_audit_events_action_check
  check (action in (
    'create_upload_url',
    'verify_upload',
    'create_download_url',
    'delete_object',
    'private_media_download_url',
    'private_media_delete',
    'media_readability_result_recorded'
  ));

-- The helper is callable only inside trusted money workflows. It was
-- accidentally left executable by PUBLIC, allowing forged/flooded audit rows.
revoke all on function public.monetization_write_audit(uuid, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.monetization_write_audit(uuid, text, text, text, jsonb)
  to service_role;
