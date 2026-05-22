-- DMCA public pipeline closeout: private evidence attachments and
-- authenticated uploader-facing counter-notice intake.
-- Public notice attachments are scoped by an unguessable per-case upload token.
-- Uploader counter-notices are server-checked against dmca_cases.uploader_user_id.

alter table if exists public."dmca_cases"
  add column if not exists "public_attachment_token" text;

alter table if exists public."dmca_audit_log"
  drop constraint if exists "dmca_audit_log_event_type_check";

alter table if exists public."dmca_audit_log"
  add constraint "dmca_audit_log_event_type_check" check ("event_type" in (
    'case_created',
    'case_updated',
    'notice_marked_incomplete',
    'notice_rejected',
    'content_disabled',
    'content_restored',
    'evidence_preserved',
    'attachment_uploaded',
    'uploader_notification_recorded',
    'counter_notice_received',
    'counter_notice_forwarded',
    'waiting_window_started',
    'court_action_notice_recorded',
    'restore_eligible',
    'strike_added',
    'strike_removed',
    'strike_disputed',
    'strike_resolved',
    'repeat_infringer_review_opened',
    'account_restricted',
    'account_terminated',
    'admin_note_added'
  ));

create table if not exists public."dmca_attachments" (
  "id" uuid default gen_random_uuid() not null,
  "dmca_case_id" uuid not null,
  "counter_notice_id" uuid,
  "source" text not null,
  "submitted_by_user_id" text,
  "submitted_by_role" text not null,
  "bucket_id" text default 'dmca-evidence'::text not null,
  "object_path" text not null,
  "original_filename" text not null,
  "mime_type" text not null,
  "size_bytes" bigint not null,
  "scan_status" text default 'pending_manual_review'::text not null,
  "scan_provider" text default 'manual_review_required'::text not null,
  "scan_notes" text default 'Automated malware scanning is not configured; legal/operator manual review is required before relying on the file.'::text not null,
  "retention_status" text default 'active_legal_hold'::text not null,
  "preserved_for_evidence" boolean default true not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "dmca_attachments_pkey" primary key ("id"),
  constraint "dmca_attachments_case_fkey" foreign key ("dmca_case_id") references public."dmca_cases"("id") on delete cascade,
  constraint "dmca_attachments_counter_notice_fkey" foreign key ("counter_notice_id") references public."dmca_counter_notices"("id") on delete cascade,
  constraint "dmca_attachments_object_path_key" unique ("object_path"),
  constraint "dmca_attachments_size_check" check ("size_bytes" > 0 and "size_bytes" <= 10485760),
  constraint "dmca_attachments_mime_check" check ("mime_type" in (
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf',
    'text/plain'
  )),
  constraint "dmca_attachments_scan_status_check" check ("scan_status" in (
    'pending_manual_review',
    'not_configured',
    'clean',
    'quarantined',
    'rejected'
  )),
  constraint "dmca_attachments_retention_status_check" check ("retention_status" in (
    'active_legal_hold',
    'preserved_evidence',
    'released',
    'purge_scheduled'
  )),
  constraint "dmca_attachments_source_check" check ("source" in (
    'public_notice',
    'uploader_counter_notice',
    'admin_manual'
  )),
  constraint "dmca_attachments_submitted_role_check" check ("submitted_by_role" in (
    'reporter',
    'uploader',
    'admin'
  ))
);

create index if not exists "dmca_attachments_case_created_idx"
  on public."dmca_attachments" ("dmca_case_id", "created_at" desc);
create index if not exists "dmca_attachments_counter_notice_idx"
  on public."dmca_attachments" ("counter_notice_id", "created_at" desc);

alter table public."dmca_attachments" enable row level security;

drop policy if exists "dmca_attachments_select_authorized" on public."dmca_attachments";
create policy "dmca_attachments_select_authorized"
  on public."dmca_attachments"
  for select
  to authenticated
  using (public."dmca_can_access_admin"());

revoke all on table public."dmca_attachments" from "anon";
grant select on table public."dmca_attachments" to "authenticated";

insert into storage."buckets" ("id", "name", "public")
values ('dmca-evidence', 'dmca-evidence', false)
on conflict ("id") do update set "public" = false;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit'
  ) then
    update storage."buckets"
      set "file_size_limit" = 10485760
      where "id" = 'dmca-evidence';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types'
  ) then
    update storage."buckets"
      set "allowed_mime_types" = array[
        'image/png',
        'image/jpeg',
        'image/webp',
        'application/pdf',
        'text/plain'
      ]
      where "id" = 'dmca-evidence';
  end if;
end $$;

create or replace function public."dmca_evidence_storage_insert_allowed"(p_name text)
returns boolean
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_parts text[] := storage.foldername(p_name);
  v_prefix text := coalesce(v_parts[1], '');
  v_case_id uuid := public."dmca_safe_uuid"(coalesce(v_parts[2], ''));
  v_token text := nullif(trim(coalesce(v_parts[3], '')), '');
  v_auth_user_id text := nullif(auth.uid()::text, '');
  v_counter_notice_id uuid;
begin
  if v_case_id is null then
    return false;
  end if;

  if v_prefix = 'public-intake' then
    if v_token is null then
      return false;
    end if;

    return exists (
      select 1
      from public."dmca_cases" dmca_case
      where dmca_case."id" = v_case_id
        and dmca_case."public_attachment_token" = v_token
        and dmca_case."status" not in ('closed', 'rejected', 'rejected_no_action')
    );
  end if;

  if v_prefix = 'uploader-counter-notice' then
    v_counter_notice_id := public."dmca_safe_uuid"(coalesce(v_parts[4], ''));
    if v_auth_user_id is null or v_auth_user_id <> coalesce(v_parts[3], '') or v_counter_notice_id is null then
      return false;
    end if;

    return exists (
      select 1
      from public."dmca_cases" dmca_case
      join public."dmca_counter_notices" counter_notice
        on counter_notice."dmca_case_id" = dmca_case."id"
      where dmca_case."id" = v_case_id
        and dmca_case."uploader_user_id" = v_auth_user_id
        and counter_notice."id" = v_counter_notice_id
        and counter_notice."submitter_user_id" = v_auth_user_id
    );
  end if;

  return false;
end;
$$;

drop policy if exists "dmca_evidence_public_token_insert" on storage."objects";
create policy "dmca_evidence_public_token_insert"
  on storage."objects"
  for insert
  to anon, authenticated
  with check (
    "bucket_id" = 'dmca-evidence'
    and public."dmca_evidence_storage_insert_allowed"("name")
  );

drop policy if exists "dmca_evidence_admin_select" on storage."objects";
create policy "dmca_evidence_admin_select"
  on storage."objects"
  for select
  to authenticated
  using (
    "bucket_id" = 'dmca-evidence'
    and public."dmca_can_access_admin"()
  );

drop function if exists public."submit_dmca_notice"(jsonb);

create function public."submit_dmca_notice"(p_payload jsonb)
returns table("id" uuid, "case_number" text, "status" text, "attachment_token" text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reporter_name text := nullif(trim(coalesce(p_payload->>'reporterName', p_payload->>'reporter_name', '')), '');
  v_reporter_email text := lower(nullif(trim(coalesce(p_payload->>'reporterEmail', p_payload->>'reporter_email', '')), ''));
  v_copyright_owner_name text := nullif(trim(coalesce(p_payload->>'copyrightOwnerName', p_payload->>'copyright_owner_name', '')), '');
  v_work_description text := nullif(trim(coalesce(p_payload->>'copyrightedWorkDescription', p_payload->>'copyrighted_work_description', '')), '');
  v_material_description text := nullif(trim(coalesce(p_payload->>'infringingMaterialDescription', p_payload->>'allegedlyInfringingMaterialDescription', p_payload->>'allegedly_infringing_material_description', '')), '');
  v_content_type text := lower(nullif(trim(coalesce(p_payload->>'contentType', p_payload->>'allegedlyInfringingContentType', p_payload->>'allegedly_infringing_content_type', 'other')), ''));
  v_content_id text := nullif(trim(coalesce(p_payload->>'contentId', p_payload->>'allegedlyInfringingContentId', p_payload->>'allegedly_infringing_content_id', '')), '');
  v_content_url text := nullif(trim(coalesce(p_payload->>'contentUrl', p_payload->>'allegedlyInfringingUrl', p_payload->>'allegedly_infringing_url', '')), '');
  v_signature text := nullif(trim(coalesce(p_payload->>'electronicSignature', p_payload->>'electronic_signature', '')), '');
  v_report_type text := lower(nullif(trim(coalesce(p_payload->>'reportType', p_payload->>'report_type', 'dmca_notice')), ''));
  v_attachment_token text := lower(replace(gen_random_uuid()::text, '-'::text, '') || replace(gen_random_uuid()::text, '-'::text, ''));
  v_case_id uuid;
  v_case_number text;
begin
  if v_reporter_name is null then
    raise exception 'reporter_name_required';
  end if;
  if v_reporter_email is null or position('@' in v_reporter_email) <= 1 then
    raise exception 'valid_reporter_email_required';
  end if;
  if v_copyright_owner_name is null then
    raise exception 'copyright_owner_name_required';
  end if;
  if v_work_description is null then
    raise exception 'copyrighted_work_description_required';
  end if;
  if v_material_description is null then
    raise exception 'infringing_material_description_required';
  end if;
  if v_content_id is null and v_content_url is null then
    raise exception 'infringing_content_location_required';
  end if;
  if coalesce((p_payload->>'goodFaithStatement')::boolean, (p_payload->>'good_faith_statement')::boolean, false) is not true then
    raise exception 'good_faith_statement_required';
  end if;
  if coalesce((p_payload->>'accuracyPenaltyPerjuryStatement')::boolean, (p_payload->>'authorityStatement')::boolean, (p_payload->>'accuracy_penalty_perjury_statement')::boolean, false) is not true then
    raise exception 'accuracy_penalty_perjury_statement_required';
  end if;
  if v_signature is null then
    raise exception 'electronic_signature_required';
  end if;

  if v_content_type not in (
    'profile_post',
    'creator_video',
    'comment',
    'reply',
    'attachment',
    'channel',
    'live_room',
    'other',
    'profile_post_comment',
    'creator_video_comment',
    'social_attachment'
  ) then
    v_content_type := 'other';
  end if;

  if v_report_type not in ('dmca_notice', 'copyright_infringement', 'trademark_or_other_ip', 'other') then
    v_report_type := 'dmca_notice';
  end if;

  v_case_number := public."dmca_next_case_number"();

  insert into public."dmca_cases" (
    "case_number",
    "status",
    "report_type",
    "reporter_user_id",
    "reporter_name",
    "reporter_company",
    "reporter_email",
    "reporter_phone",
    "reporter_address",
    "reporter_is_owner",
    "authorized_agent_name",
    "copyright_owner_name",
    "copyrighted_work_description",
    "copyrighted_work_urls",
    "allegedly_infringing_content_type",
    "allegedly_infringing_content_id",
    "allegedly_infringing_url",
    "allegedly_infringing_material_description",
    "uploader_user_id",
    "good_faith_statement",
    "accuracy_penalty_perjury_statement",
    "electronic_signature",
    "source",
    "public_safe_summary",
    "public_attachment_token"
  ) values (
    v_case_number,
    'received',
    v_report_type,
    nullif(auth.uid()::text, ''),
    v_reporter_name,
    nullif(trim(coalesce(p_payload->>'reporterCompany', p_payload->>'reporter_company', p_payload->>'claimantCompany', '')), ''),
    v_reporter_email,
    nullif(trim(coalesce(p_payload->>'reporterPhone', p_payload->>'reporter_phone', '')), ''),
    nullif(trim(coalesce(p_payload->>'reporterAddress', p_payload->>'reporter_address', '')), ''),
    coalesce((p_payload->>'reporterIsOwner')::boolean, (p_payload->>'reporter_is_owner')::boolean, true),
    nullif(trim(coalesce(p_payload->>'authorizedAgentName', p_payload->>'authorized_agent_name', '')), ''),
    v_copyright_owner_name,
    v_work_description,
    case
      when jsonb_typeof(coalesce(p_payload->'copyrightedWorkUrls', p_payload->'copyrighted_work_urls')) = 'array'
        then coalesce(p_payload->'copyrightedWorkUrls', p_payload->'copyrighted_work_urls')
      else '[]'::jsonb
    end,
    v_content_type,
    v_content_id,
    v_content_url,
    v_material_description,
    public."dmca_resolve_uploader_user_id"(v_content_type, v_content_id),
    true,
    true,
    v_signature,
    'public_form',
    left(v_work_description, 240),
    v_attachment_token
  );

  select c."id" into v_case_id
  from public."dmca_cases" c
  where c."case_number" = v_case_number;

  perform public."dmca_write_audit"(
    v_case_id,
    'case_created',
    'reporter',
    'Formal DMCA notice submitted through public form.',
    jsonb_build_object(
      'source', 'public_form',
      'report_type', v_report_type,
      'content_type', v_content_type,
      'content_id_present', v_content_id is not null,
      'content_url_present', v_content_url is not null,
      'copyright_owner_present', v_copyright_owner_name is not null,
      'infringing_material_description_present', v_material_description is not null,
      'attachments', 'supported_private_bucket_pending_manual_review'
    )
  );

  return query
    select c."id", c."case_number", c."status", c."public_attachment_token"
    from public."dmca_cases" c
    where c."id" = v_case_id;
end;
$$;

create or replace function public."submit_dmca_attachment_metadata"(p_payload jsonb)
returns public."dmca_attachments"
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_case_id uuid := public."dmca_safe_uuid"(coalesce(p_payload->>'caseId', p_payload->>'dmca_case_id', p_payload->>'dmcaCaseId', ''));
  v_counter_notice_id uuid := public."dmca_safe_uuid"(coalesce(p_payload->>'counterNoticeId', p_payload->>'counter_notice_id', ''));
  v_source text := lower(nullif(trim(coalesce(p_payload->>'source', 'public_notice')), ''));
  v_path text := nullif(trim(coalesce(p_payload->>'objectPath', p_payload->>'object_path', '')), '');
  v_filename text := nullif(trim(coalesce(p_payload->>'fileName', p_payload->>'originalFilename', p_payload->>'original_filename', '')), '');
  v_mime_type text := lower(nullif(trim(coalesce(p_payload->>'mimeType', p_payload->>'mime_type', '')), ''));
  v_size_bytes bigint := coalesce(nullif(trim(coalesce(p_payload->>'sizeBytes', p_payload->>'size_bytes', '')), '')::bigint, 0);
  v_attachment_token text := nullif(trim(coalesce(p_payload->>'attachmentToken', p_payload->>'attachment_token', '')), '');
  v_actor text := nullif(auth.uid()::text, '');
  v_role text := 'reporter';
  v_row public."dmca_attachments";
begin
  if v_case_id is null then
    raise exception 'dmca_case_id_required';
  end if;
  if v_path is null then
    raise exception 'dmca_attachment_object_path_required';
  end if;
  if v_filename is null then
    raise exception 'dmca_attachment_filename_required';
  end if;
  if v_mime_type not in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'text/plain') then
    raise exception 'dmca_attachment_mime_type_not_allowed';
  end if;
  if v_size_bytes <= 0 or v_size_bytes > 10485760 then
    raise exception 'dmca_attachment_size_limit_10mb';
  end if;
  if not exists (select 1 from storage."objects" where "bucket_id" = 'dmca-evidence' and "name" = v_path) then
    raise exception 'dmca_attachment_object_missing';
  end if;

  if v_source = 'public_notice' then
    if not exists (
      select 1
      from public."dmca_cases" dmca_case
      where dmca_case."id" = v_case_id
        and dmca_case."source" = 'public_form'
        and dmca_case."public_attachment_token" = v_attachment_token
        and v_path like ('public-intake/' || dmca_case."id"::text || '/' || dmca_case."public_attachment_token" || '/%')
    ) then
      raise exception 'dmca_public_attachment_token_required';
    end if;
    v_role := 'reporter';
  elsif v_source = 'uploader_counter_notice' then
    if v_actor is null then
      raise exception 'dmca_counter_notice_auth_required';
    end if;
    if v_counter_notice_id is null then
      raise exception 'dmca_counter_notice_id_required';
    end if;
    if not exists (
      select 1
      from public."dmca_cases" dmca_case
      join public."dmca_counter_notices" counter_notice
        on counter_notice."dmca_case_id" = dmca_case."id"
      where dmca_case."id" = v_case_id
        and dmca_case."uploader_user_id" = v_actor
        and counter_notice."id" = v_counter_notice_id
        and counter_notice."submitter_user_id" = v_actor
        and v_path like ('uploader-counter-notice/' || dmca_case."id"::text || '/' || v_actor || '/' || counter_notice."id"::text || '/%')
    ) then
      raise exception 'dmca_counter_notice_attachment_not_authorized';
    end if;
    v_role := 'uploader';
  elsif v_source = 'admin_manual' then
    perform public."dmca_assert_owner_operator"();
    v_role := 'admin';
  else
    raise exception 'dmca_attachment_source_invalid';
  end if;

  insert into public."dmca_attachments" (
    "dmca_case_id",
    "counter_notice_id",
    "source",
    "submitted_by_user_id",
    "submitted_by_role",
    "bucket_id",
    "object_path",
    "original_filename",
    "mime_type",
    "size_bytes",
    "scan_status",
    "scan_provider",
    "scan_notes",
    "retention_status",
    "preserved_for_evidence"
  ) values (
    v_case_id,
    v_counter_notice_id,
    v_source,
    v_actor,
    v_role,
    'dmca-evidence',
    v_path,
    v_filename,
    v_mime_type,
    v_size_bytes,
    'pending_manual_review',
    'manual_review_required',
    'Automated malware scanning is not configured; legal/operator manual review is required before relying on the file.',
    'active_legal_hold',
    true
  )
  returning * into v_row;

  perform public."dmca_write_audit"(
    v_case_id,
    'attachment_uploaded',
    v_role,
    'DMCA evidence attachment uploaded; automated malware scanning is not configured.',
    jsonb_build_object(
      'attachment_id', v_row."id",
      'counter_notice_id', v_counter_notice_id,
      'source', v_source,
      'mime_type', v_mime_type,
      'size_bytes', v_size_bytes,
      'scan_status', v_row."scan_status",
      'retention_status', v_row."retention_status"
    )
  );

  return v_row;
end;
$$;

create or replace function public."read_my_dmca_counter_notice_case"(p_case_id uuid)
returns table(
  "id" uuid,
  "case_number" text,
  "status" text,
  "content_type" text,
  "content_id" text,
  "content_url" text,
  "public_safe_summary" text,
  "received_at" timestamp with time zone,
  "existing_counter_notice_count" bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := nullif(auth.uid()::text, '');
begin
  if v_actor is null then
    raise exception 'dmca_counter_notice_auth_required';
  end if;

  if not exists (
    select 1 from public."dmca_cases" dmca_case
    where dmca_case."id" = p_case_id
      and dmca_case."uploader_user_id" = v_actor
  ) then
    raise exception 'dmca_counter_notice_case_not_authorized';
  end if;

  return query
    select
      dmca_case."id",
      dmca_case."case_number",
      dmca_case."status",
      dmca_case."allegedly_infringing_content_type",
      dmca_case."allegedly_infringing_content_id",
      dmca_case."allegedly_infringing_url",
      dmca_case."public_safe_summary",
      dmca_case."received_at",
      (
        select count(*)
        from public."dmca_counter_notices" counter_notice
        where counter_notice."dmca_case_id" = dmca_case."id"
          and counter_notice."submitter_user_id" = v_actor
      )::bigint
    from public."dmca_cases" dmca_case
    where dmca_case."id" = p_case_id
      and dmca_case."uploader_user_id" = v_actor;
end;
$$;

create or replace function public."submit_dmca_counter_notice"(
  p_case_id uuid,
  p_payload jsonb
)
returns public."dmca_counter_notices"
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := nullif(auth.uid()::text, '');
  v_case public."dmca_cases";
  v_submitter_name text := nullif(trim(coalesce(p_payload->>'submitterName', p_payload->>'submitter_name', '')), '');
  v_submitter_email text := lower(nullif(trim(coalesce(p_payload->>'submitterEmail', p_payload->>'submitter_email', '')), ''));
  v_removed_description text := nullif(trim(coalesce(p_payload->>'removedMaterialDescription', p_payload->>'removed_material_description', p_payload->>'statement', '')), '');
  v_removed_location text := nullif(trim(coalesce(p_payload->>'removedMaterialUrlOrLocation', p_payload->>'removed_material_url_or_location', p_payload->>'contentLocation', '')), '');
  v_signature text := nullif(trim(coalesce(p_payload->>'electronicSignature', p_payload->>'electronic_signature', '')), '');
  v_row public."dmca_counter_notices";
begin
  if v_actor is null then
    raise exception 'dmca_counter_notice_auth_required';
  end if;

  select * into v_case
  from public."dmca_cases"
  where "id" = p_case_id;

  if v_case."id" is null then
    raise exception 'dmca_case_not_found';
  end if;
  if nullif(trim(coalesce(v_case."uploader_user_id", '')), '') is null then
    raise exception 'dmca_case_uploader_not_resolved';
  end if;
  if v_case."uploader_user_id" <> v_actor then
    raise exception 'dmca_counter_notice_case_not_authorized';
  end if;
  if v_case."status" in ('closed', 'rejected', 'rejected_no_action', 'restored') then
    raise exception 'dmca_counter_notice_case_closed';
  end if;
  if v_submitter_name is null then
    raise exception 'counter_notice_submitter_name_required';
  end if;
  if v_submitter_email is null or position('@' in v_submitter_email) <= 1 then
    raise exception 'valid_counter_notice_email_required';
  end if;
  if v_removed_description is null then
    raise exception 'counter_notice_statement_required';
  end if;
  if v_removed_location is null then
    raise exception 'counter_notice_content_location_required';
  end if;
  if coalesce((p_payload->>'goodFaithMistakeStatement')::boolean, (p_payload->>'good_faith_mistake_statement')::boolean, false) is not true then
    raise exception 'counter_notice_good_faith_mistake_required';
  end if;
  if coalesce((p_payload->>'jurisdictionConsentStatement')::boolean, (p_payload->>'jurisdiction_consent_statement')::boolean, false) is not true then
    raise exception 'counter_notice_jurisdiction_consent_required';
  end if;
  if coalesce((p_payload->>'serviceAcceptanceStatement')::boolean, (p_payload->>'service_acceptance_statement')::boolean, false) is not true then
    raise exception 'counter_notice_service_acceptance_required';
  end if;
  if v_signature is null then
    raise exception 'counter_notice_signature_required';
  end if;

  insert into public."dmca_counter_notices" (
    "dmca_case_id",
    "submitter_user_id",
    "submitter_name",
    "submitter_email",
    "submitter_phone",
    "submitter_address",
    "removed_material_description",
    "removed_material_url_or_location",
    "good_faith_mistake_statement",
    "jurisdiction_consent_statement",
    "service_acceptance_statement",
    "electronic_signature",
    "status"
  ) values (
    p_case_id,
    v_actor,
    v_submitter_name,
    v_submitter_email,
    nullif(trim(coalesce(p_payload->>'submitterPhone', p_payload->>'submitter_phone', '')), ''),
    nullif(trim(coalesce(p_payload->>'submitterAddress', p_payload->>'submitter_address', '')), ''),
    v_removed_description,
    v_removed_location,
    true,
    true,
    true,
    v_signature,
    'received'
  )
  returning * into v_row;

  update public."dmca_cases"
    set "status" = 'counter_notice_received',
        "updated_at" = timezone('utc'::text, now())
    where "id" = p_case_id;

  perform public."dmca_write_audit"(
    p_case_id,
    'counter_notice_received',
    'uploader',
    'Uploader submitted counter-notice through authenticated self-service form.',
    jsonb_build_object(
      'counter_notice_id', v_row."id",
      'source', 'uploader_self_service',
      'content_type', v_case."allegedly_infringing_content_type",
      'content_id_present', v_case."allegedly_infringing_content_id" is not null
    )
  );

  return v_row;
end;
$$;

grant execute on function public."submit_dmca_notice"(jsonb) to "anon";
grant execute on function public."submit_dmca_notice"(jsonb) to "authenticated";
grant execute on function public."submit_dmca_attachment_metadata"(jsonb) to "anon";
grant execute on function public."submit_dmca_attachment_metadata"(jsonb) to "authenticated";
grant execute on function public."read_my_dmca_counter_notice_case"(uuid) to "authenticated";
grant execute on function public."submit_dmca_counter_notice"(uuid, jsonb) to "authenticated";

comment on table public."dmca_attachments" is
  'Private DMCA evidence attachment metadata. Files live in the private dmca-evidence bucket; automated malware scanning is not configured and scan_status remains pending_manual_review until legal/operator review.';
comment on function public."submit_dmca_notice"(jsonb) is
  'Validated public DMCA notice intake. Stores the full public notice field set, returns case receipt plus a case-scoped attachment token, and keeps full reporter data admin-only.';
comment on function public."submit_dmca_attachment_metadata"(jsonb) is
  'Records private DMCA evidence attachment metadata after a token-scoped public notice upload or authenticated uploader counter-notice upload.';
comment on function public."read_my_dmca_counter_notice_case"(uuid) is
  'Uploader-safe case read for authenticated counter-notice form; excludes claimant private contact data.';
comment on function public."submit_dmca_counter_notice"(uuid, jsonb) is
  'Authenticated uploader self-service counter-notice intake. Requires the case uploader_user_id to match auth.uid and records case timeline history.';
