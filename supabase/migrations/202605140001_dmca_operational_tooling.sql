-- DMCA operational tooling for public notice intake, admin-only case review,
-- counter-notice tracking, content actions, strikes, and audit history.
-- Security boundary: public users can submit notices only through
-- submit_dmca_notice(jsonb). Admin visibility and mutations require existing
-- owner/operator platform roles and never expose this table set to normal users.

create table if not exists public."dmca_cases" (
  "id" uuid default gen_random_uuid() not null,
  "case_number" text not null,
  "status" text default 'received'::text not null,
  "report_type" text default 'dmca_notice'::text not null,
  "reporter_user_id" text,
  "reporter_name" text not null,
  "reporter_company" text,
  "reporter_email" text not null,
  "reporter_phone" text,
  "reporter_address" text,
  "reporter_is_owner" boolean default true not null,
  "authorized_agent_name" text,
  "copyrighted_work_description" text not null,
  "copyrighted_work_urls" jsonb default '[]'::jsonb not null,
  "allegedly_infringing_content_type" text default 'other'::text not null,
  "allegedly_infringing_content_id" text,
  "allegedly_infringing_url" text,
  "uploader_user_id" text,
  "uploader_channel_id" text,
  "good_faith_statement" boolean default false not null,
  "accuracy_penalty_perjury_statement" boolean default false not null,
  "electronic_signature" text not null,
  "submitted_ip_hash" text,
  "submitted_user_agent_hash" text,
  "source" text default 'public_form'::text not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "received_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "closed_at" timestamp with time zone,
  "assigned_admin_id" text,
  "admin_notes" text,
  "public_safe_summary" text,
  constraint "dmca_cases_pkey" primary key ("id"),
  constraint "dmca_cases_case_number_key" unique ("case_number"),
  constraint "dmca_cases_status_check" check ("status" in (
    'received',
    'needs_more_info',
    'under_review',
    'rejected',
    'content_disabled',
    'uploader_notified',
    'counter_notice_received',
    'waiting_rightsholder_response',
    'eligible_for_restore',
    'restored',
    'court_action_notice_received',
    'repeat_infringer_review',
    'closed'
  )),
  constraint "dmca_cases_report_type_check" check ("report_type" in (
    'dmca_notice',
    'copyright_infringement',
    'trademark_or_other_ip',
    'other'
  )),
  constraint "dmca_cases_content_type_check" check ("allegedly_infringing_content_type" in (
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
  )),
  constraint "dmca_cases_source_check" check ("source" in (
    'public_form',
    'in_app_report',
    'support_email_manual',
    'admin_created'
  ))
);

create table if not exists public."dmca_counter_notices" (
  "id" uuid default gen_random_uuid() not null,
  "dmca_case_id" uuid not null,
  "submitter_user_id" text,
  "submitter_name" text not null,
  "submitter_email" text not null,
  "submitter_phone" text,
  "submitter_address" text,
  "removed_material_description" text not null,
  "removed_material_url_or_location" text not null,
  "good_faith_mistake_statement" boolean default false not null,
  "jurisdiction_consent_statement" boolean default false not null,
  "service_acceptance_statement" boolean default false not null,
  "electronic_signature" text not null,
  "received_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "forwarded_to_claimant_at" timestamp with time zone,
  "response_deadline_start_at" timestamp with time zone,
  "restore_not_before_at" timestamp with time zone,
  "restore_not_after_at" timestamp with time zone,
  "court_action_notice_received_at" timestamp with time zone,
  "status" text default 'received'::text not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "dmca_counter_notices_pkey" primary key ("id"),
  constraint "dmca_counter_notices_case_fkey" foreign key ("dmca_case_id") references public."dmca_cases"("id") on delete cascade,
  constraint "dmca_counter_notices_status_check" check ("status" in (
    'received',
    'incomplete',
    'forwarded_to_claimant',
    'waiting',
    'blocked_by_court_action',
    'eligible_for_restore',
    'restored',
    'rejected'
  ))
);

create table if not exists public."dmca_content_actions" (
  "id" uuid default gen_random_uuid() not null,
  "dmca_case_id" uuid not null,
  "content_type" text not null,
  "content_id" text not null,
  "action" text not null,
  "previous_state" jsonb,
  "new_state" jsonb,
  "actor_admin_id" text not null,
  "reason" text not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "dmca_content_actions_pkey" primary key ("id"),
  constraint "dmca_content_actions_case_fkey" foreign key ("dmca_case_id") references public."dmca_cases"("id") on delete cascade,
  constraint "dmca_content_actions_action_check" check ("action" in (
    'disabled',
    'hidden',
    'restored',
    'rejected_no_action',
    'preserved_evidence'
  ))
);

create table if not exists public."dmca_strikes" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" text not null,
  "channel_id" text,
  "dmca_case_id" uuid not null,
  "content_type" text not null,
  "content_id" text not null,
  "strike_status" text default 'active'::text not null,
  "severity" text default 'standard'::text not null,
  "reason" text not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "removed_at" timestamp with time zone,
  "removed_reason" text,
  constraint "dmca_strikes_pkey" primary key ("id"),
  constraint "dmca_strikes_case_fkey" foreign key ("dmca_case_id") references public."dmca_cases"("id") on delete cascade,
  constraint "dmca_strikes_status_check" check ("strike_status" in ('active', 'removed', 'disputed', 'expired')),
  constraint "dmca_strikes_severity_check" check ("severity" in ('standard', 'severe'))
);

create table if not exists public."dmca_audit_log" (
  "id" uuid default gen_random_uuid() not null,
  "dmca_case_id" uuid,
  "event_type" text not null,
  "actor_user_id" text,
  "actor_role" text not null,
  "reason" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "dmca_audit_log_pkey" primary key ("id"),
  constraint "dmca_audit_log_case_fkey" foreign key ("dmca_case_id") references public."dmca_cases"("id") on delete cascade,
  constraint "dmca_audit_log_event_type_check" check ("event_type" in (
    'case_created',
    'case_updated',
    'notice_marked_incomplete',
    'notice_rejected',
    'content_disabled',
    'content_restored',
    'uploader_notification_recorded',
    'counter_notice_received',
    'counter_notice_forwarded',
    'waiting_window_started',
    'court_action_notice_recorded',
    'restore_eligible',
    'strike_added',
    'strike_removed',
    'repeat_infringer_review_opened',
    'account_restricted',
    'account_terminated',
    'admin_note_added'
  )),
  constraint "dmca_audit_log_actor_role_check" check ("actor_role" in ('reporter', 'uploader', 'admin', 'system'))
);

create index if not exists "dmca_cases_status_updated_idx"
  on public."dmca_cases" using btree ("status", "updated_at" desc);
create index if not exists "dmca_cases_reporter_user_idx"
  on public."dmca_cases" using btree ("reporter_user_id", "created_at" desc);
create index if not exists "dmca_cases_uploader_user_idx"
  on public."dmca_cases" using btree ("uploader_user_id", "created_at" desc);
create index if not exists "dmca_cases_content_target_idx"
  on public."dmca_cases" using btree ("allegedly_infringing_content_type", "allegedly_infringing_content_id");
create index if not exists "dmca_counter_notices_case_idx"
  on public."dmca_counter_notices" using btree ("dmca_case_id", "created_at" desc);
create index if not exists "dmca_content_actions_case_idx"
  on public."dmca_content_actions" using btree ("dmca_case_id", "created_at" desc);
create index if not exists "dmca_strikes_user_status_idx"
  on public."dmca_strikes" using btree ("user_id", "strike_status", "created_at" desc);
create index if not exists "dmca_strikes_case_idx"
  on public."dmca_strikes" using btree ("dmca_case_id", "created_at" desc);
create index if not exists "dmca_audit_log_case_created_idx"
  on public."dmca_audit_log" using btree ("dmca_case_id", "created_at" desc);

alter table public."dmca_cases" enable row level security;
alter table public."dmca_counter_notices" enable row level security;
alter table public."dmca_content_actions" enable row level security;
alter table public."dmca_strikes" enable row level security;
alter table public."dmca_audit_log" enable row level security;

drop policy if exists "dmca_cases_select_owner_operator" on public."dmca_cases";
create policy "dmca_cases_select_owner_operator"
  on public."dmca_cases"
  for select
  to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "dmca_counter_notices_select_owner_operator" on public."dmca_counter_notices";
create policy "dmca_counter_notices_select_owner_operator"
  on public."dmca_counter_notices"
  for select
  to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "dmca_content_actions_select_owner_operator" on public."dmca_content_actions";
create policy "dmca_content_actions_select_owner_operator"
  on public."dmca_content_actions"
  for select
  to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "dmca_strikes_select_owner_operator" on public."dmca_strikes";
create policy "dmca_strikes_select_owner_operator"
  on public."dmca_strikes"
  for select
  to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "dmca_audit_log_select_owner_operator" on public."dmca_audit_log";
create policy "dmca_audit_log_select_owner_operator"
  on public."dmca_audit_log"
  for select
  to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

revoke all on table public."dmca_cases" from "anon";
revoke all on table public."dmca_counter_notices" from "anon";
revoke all on table public."dmca_content_actions" from "anon";
revoke all on table public."dmca_strikes" from "anon";
revoke all on table public."dmca_audit_log" from "anon";

grant select on table public."dmca_cases" to "authenticated";
grant select on table public."dmca_counter_notices" to "authenticated";
grant select on table public."dmca_content_actions" to "authenticated";
grant select on table public."dmca_strikes" to "authenticated";
grant select on table public."dmca_audit_log" to "authenticated";

comment on table public."dmca_cases" is
  'Admin-only DMCA case tracker. Public notice intake must use submit_dmca_notice(jsonb); normal users cannot read reporter/uploader private contact data.';
comment on table public."dmca_counter_notices" is
  'Admin-only counter-notice records and 10-14 business-day restoration windows.';
comment on table public."dmca_content_actions" is
  'Admin-only record of DMCA disable/hide/restore/no-action/evidence actions. Does not permanently delete content by default.';
comment on table public."dmca_strikes" is
  'Admin-only copyright strike tracking for repeat-infringer review. No automatic termination.';
comment on table public."dmca_audit_log" is
  'Admin-only DMCA audit history with redacted/safe metadata only.';

create or replace function public."dmca_safe_uuid"(value text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
begin
  return value::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public."dmca_add_business_days"(start_at timestamp with time zone, day_count integer)
returns timestamp with time zone
language plpgsql
immutable
set search_path = public
as $$
declare
  cursor_at timestamp with time zone := start_at;
  added integer := 0;
begin
  if day_count <= 0 then
    return start_at;
  end if;

  while added < day_count loop
    cursor_at := cursor_at + interval '1 day';
    if extract(isodow from cursor_at) between 1 and 5 then
      added := added + 1;
    end if;
  end loop;

  return cursor_at;
end;
$$;

create or replace function public."dmca_next_case_number"()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  stamp text := to_char(timezone('utc'::text, now()), 'YYYYMMDD');
  candidate text;
  attempts integer := 0;
begin
  loop
    attempts := attempts + 1;
    candidate := 'DMCA-' || stamp || '-' || upper(substr(replace(gen_random_uuid()::text, '-'::text, ''::text), 1, 6));
    if not exists (select 1 from public."dmca_cases" where "case_number" = candidate) then
      return candidate;
    end if;
    if attempts >= 100 then
      raise exception 'dmca_case_number_unavailable';
    end if;
  end loop;

  return null;
end;
$$;

create or replace function public."dmca_assert_owner_operator"()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_platform_role(array['owner'::text, 'operator'::text]) then
    raise exception 'dmca_owner_operator_required';
  end if;
end;
$$;

create or replace function public."dmca_resolve_uploader_user_id"(content_type text, content_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target_uuid uuid := public."dmca_safe_uuid"(content_id);
  resolved_user_id text;
begin
  case content_type
    when 'creator_video' then
      select "owner_id" into resolved_user_id from public."videos" where "id" = target_uuid;
    when 'profile_post' then
      select "user_id" into resolved_user_id from public."profile_posts" where "id" = target_uuid;
    when 'profile_post_comment' then
      select "user_id" into resolved_user_id from public."profile_post_comments" where "id" = target_uuid;
    when 'comment' then
      select "user_id" into resolved_user_id from public."profile_post_comments" where "id" = target_uuid;
    when 'creator_video_comment' then
      select "user_id" into resolved_user_id from public."creator_video_comments" where "id" = target_uuid;
    when 'reply' then
      select "user_id" into resolved_user_id from public."creator_video_comments" where "id" = target_uuid;
    when 'attachment' then
      select "owner_user_id" into resolved_user_id from public."social_attachments" where "id" = target_uuid;
    when 'social_attachment' then
      select "owner_user_id" into resolved_user_id from public."social_attachments" where "id" = target_uuid;
    else
      resolved_user_id := null;
  end case;

  return resolved_user_id;
end;
$$;

create or replace function public."dmca_write_audit"(
  p_case_id uuid,
  p_event_type text,
  p_actor_role text,
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  audit_id uuid;
begin
  insert into public."dmca_audit_log" (
    "dmca_case_id",
    "event_type",
    "actor_user_id",
    "actor_role",
    "reason",
    "metadata"
  ) values (
    p_case_id,
    p_event_type,
    nullif(auth.uid()::text, ''),
    p_actor_role,
    nullif(trim(coalesce(p_reason, '')), ''),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning "id" into audit_id;

  return audit_id;
end;
$$;

create or replace function public."submit_dmca_notice"(p_payload jsonb)
returns table("id" uuid, "case_number" text, "status" text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reporter_name text := nullif(trim(coalesce(p_payload->>'reporterName', p_payload->>'reporter_name', '')), '');
  v_reporter_email text := lower(nullif(trim(coalesce(p_payload->>'reporterEmail', p_payload->>'reporter_email', '')), ''));
  v_work_description text := nullif(trim(coalesce(p_payload->>'copyrightedWorkDescription', p_payload->>'copyrighted_work_description', '')), '');
  v_content_type text := lower(nullif(trim(coalesce(p_payload->>'contentType', p_payload->>'allegedlyInfringingContentType', p_payload->>'allegedly_infringing_content_type', 'other')), ''));
  v_content_id text := nullif(trim(coalesce(p_payload->>'contentId', p_payload->>'allegedlyInfringingContentId', p_payload->>'allegedly_infringing_content_id', '')), '');
  v_content_url text := nullif(trim(coalesce(p_payload->>'contentUrl', p_payload->>'allegedlyInfringingUrl', p_payload->>'allegedly_infringing_url', '')), '');
  v_signature text := nullif(trim(coalesce(p_payload->>'electronicSignature', p_payload->>'electronic_signature', '')), '');
  v_report_type text := lower(nullif(trim(coalesce(p_payload->>'reportType', p_payload->>'report_type', 'dmca_notice')), ''));
  v_case_id uuid;
  v_case_number text;
begin
  if v_reporter_name is null then
    raise exception 'reporter_name_required';
  end if;
  if v_reporter_email is null or position('@' in v_reporter_email) <= 1 then
    raise exception 'valid_reporter_email_required';
  end if;
  if v_work_description is null then
    raise exception 'copyrighted_work_description_required';
  end if;
  if v_content_id is null and v_content_url is null then
    raise exception 'infringing_content_location_required';
  end if;
  if coalesce((p_payload->>'goodFaithStatement')::boolean, (p_payload->>'good_faith_statement')::boolean, false) is not true then
    raise exception 'good_faith_statement_required';
  end if;
  if coalesce((p_payload->>'accuracyPenaltyPerjuryStatement')::boolean, (p_payload->>'accuracy_penalty_perjury_statement')::boolean, false) is not true then
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
    "copyrighted_work_description",
    "copyrighted_work_urls",
    "allegedly_infringing_content_type",
    "allegedly_infringing_content_id",
    "allegedly_infringing_url",
    "uploader_user_id",
    "good_faith_statement",
    "accuracy_penalty_perjury_statement",
    "electronic_signature",
    "source",
    "public_safe_summary"
  ) values (
    v_case_number,
    'received',
    v_report_type,
    nullif(auth.uid()::text, ''),
    v_reporter_name,
    nullif(trim(coalesce(p_payload->>'reporterCompany', p_payload->>'reporter_company', '')), ''),
    v_reporter_email,
    nullif(trim(coalesce(p_payload->>'reporterPhone', p_payload->>'reporter_phone', '')), ''),
    nullif(trim(coalesce(p_payload->>'reporterAddress', p_payload->>'reporter_address', '')), ''),
    coalesce((p_payload->>'reporterIsOwner')::boolean, (p_payload->>'reporter_is_owner')::boolean, true),
    nullif(trim(coalesce(p_payload->>'authorizedAgentName', p_payload->>'authorized_agent_name', '')), ''),
    v_work_description,
    case
      when jsonb_typeof(coalesce(p_payload->'copyrightedWorkUrls', p_payload->'copyrighted_work_urls')) = 'array'
        then coalesce(p_payload->'copyrightedWorkUrls', p_payload->'copyrighted_work_urls')
      else '[]'::jsonb
    end,
    v_content_type,
    v_content_id,
    v_content_url,
    public."dmca_resolve_uploader_user_id"(v_content_type, v_content_id),
    true,
    true,
    v_signature,
    'public_form',
    left(v_work_description, 240)
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
      'content_url_present', v_content_url is not null
    )
  );

  return query
    select c."id", c."case_number", c."status"
    from public."dmca_cases" c
    where c."id" = v_case_id;
end;
$$;

create or replace function public."admin_dmca_set_case_status"(
  p_case_id uuid,
  p_status text,
  p_reason text,
  p_admin_notes text default null
)
returns public."dmca_cases"
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_type text := 'case_updated';
  v_case public."dmca_cases";
begin
  perform public."dmca_assert_owner_operator"();

  if p_status not in (
    'received',
    'needs_more_info',
    'under_review',
    'rejected',
    'content_disabled',
    'uploader_notified',
    'counter_notice_received',
    'waiting_rightsholder_response',
    'eligible_for_restore',
    'restored',
    'court_action_notice_received',
    'repeat_infringer_review',
    'closed'
  ) then
    raise exception 'invalid_dmca_case_status';
  end if;

  if p_status = 'needs_more_info' then
    v_event_type := 'notice_marked_incomplete';
  elsif p_status = 'rejected' then
    v_event_type := 'notice_rejected';
  elsif p_status = 'uploader_notified' then
    v_event_type := 'uploader_notification_recorded';
  elsif p_status = 'eligible_for_restore' then
    v_event_type := 'restore_eligible';
  elsif p_status = 'repeat_infringer_review' then
    v_event_type := 'repeat_infringer_review_opened';
  end if;

  update public."dmca_cases"
  set
    "status" = p_status,
    "assigned_admin_id" = coalesce("assigned_admin_id", nullif(auth.uid()::text, '')),
    "admin_notes" = coalesce(nullif(trim(coalesce(p_admin_notes, '')), ''), "admin_notes"),
    "closed_at" = case when p_status in ('closed', 'rejected', 'restored') then timezone('utc'::text, now()) else "closed_at" end,
    "updated_at" = timezone('utc'::text, now())
  where "id" = p_case_id
  returning * into v_case;

  if v_case."id" is null then
    raise exception 'dmca_case_not_found';
  end if;

  perform public."dmca_write_audit"(
    p_case_id,
    v_event_type,
    'admin',
    p_reason,
    jsonb_build_object('status', p_status)
  );

  return v_case;
end;
$$;

create or replace function public."admin_dmca_record_content_action"(
  p_case_id uuid,
  p_content_type text,
  p_content_id text,
  p_action text,
  p_reason text
)
returns public."dmca_content_actions"
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := nullif(auth.uid()::text, '');
  v_target_uuid uuid := public."dmca_safe_uuid"(p_content_id);
  v_previous jsonb;
  v_new jsonb;
  v_row public."dmca_content_actions";
  v_next_status text;
  v_event_type text;
begin
  perform public."dmca_assert_owner_operator"();

  if v_actor is null then
    raise exception 'admin_actor_required';
  end if;
  if p_action not in ('disabled', 'hidden', 'restored', 'rejected_no_action', 'preserved_evidence') then
    raise exception 'invalid_dmca_content_action';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'dmca_action_reason_required';
  end if;

  if p_action in ('disabled', 'hidden', 'restored') then
    if v_target_uuid is null then
      raise exception 'dmca_content_uuid_required';
    end if;

    v_next_status := case
      when p_action = 'restored' then 'clean'
      when p_action = 'disabled' then 'removed'
      else 'hidden'
    end;

    case p_content_type
      when 'creator_video' then
        select to_jsonb(row) into v_previous from public."videos" row where row."id" = v_target_uuid;
        update public."videos"
          set "moderation_status" = v_next_status,
              "moderation_reason" = p_reason,
              "moderated_at" = timezone('utc'::text, now()),
              "moderated_by" = v_actor,
              "updated_at" = timezone('utc'::text, now())
          where "id" = v_target_uuid;
        select to_jsonb(row) into v_new from public."videos" row where row."id" = v_target_uuid;
      when 'profile_post' then
        select to_jsonb(row) into v_previous from public."profile_posts" row where row."id" = v_target_uuid;
        update public."profile_posts"
          set "moderation_status" = v_next_status,
              "moderation_reason" = p_reason,
              "moderated_at" = timezone('utc'::text, now()),
              "moderated_by" = v_actor,
              "updated_at" = timezone('utc'::text, now())
          where "id" = v_target_uuid;
        select to_jsonb(row) into v_new from public."profile_posts" row where row."id" = v_target_uuid;
      when 'profile_post_comment' then
        select to_jsonb(row) into v_previous from public."profile_post_comments" row where row."id" = v_target_uuid;
        update public."profile_post_comments"
          set "moderation_status" = v_next_status,
              "moderation_reason" = p_reason,
              "moderated_at" = timezone('utc'::text, now()),
              "moderated_by" = v_actor,
              "updated_at" = timezone('utc'::text, now())
          where "id" = v_target_uuid;
        select to_jsonb(row) into v_new from public."profile_post_comments" row where row."id" = v_target_uuid;
      when 'comment' then
        select to_jsonb(row) into v_previous from public."profile_post_comments" row where row."id" = v_target_uuid;
        update public."profile_post_comments"
          set "moderation_status" = v_next_status,
              "moderation_reason" = p_reason,
              "moderated_at" = timezone('utc'::text, now()),
              "moderated_by" = v_actor,
              "updated_at" = timezone('utc'::text, now())
          where "id" = v_target_uuid;
        select to_jsonb(row) into v_new from public."profile_post_comments" row where row."id" = v_target_uuid;
      when 'creator_video_comment' then
        select to_jsonb(row) into v_previous from public."creator_video_comments" row where row."id" = v_target_uuid;
        update public."creator_video_comments"
          set "moderation_status" = v_next_status,
              "moderation_reason" = p_reason,
              "moderated_at" = timezone('utc'::text, now()),
              "moderated_by" = v_actor,
              "updated_at" = timezone('utc'::text, now())
          where "id" = v_target_uuid;
        select to_jsonb(row) into v_new from public."creator_video_comments" row where row."id" = v_target_uuid;
      when 'reply' then
        select to_jsonb(row) into v_previous from public."creator_video_comments" row where row."id" = v_target_uuid;
        update public."creator_video_comments"
          set "moderation_status" = v_next_status,
              "moderation_reason" = p_reason,
              "moderated_at" = timezone('utc'::text, now()),
              "moderated_by" = v_actor,
              "updated_at" = timezone('utc'::text, now())
          where "id" = v_target_uuid;
        select to_jsonb(row) into v_new from public."creator_video_comments" row where row."id" = v_target_uuid;
      when 'attachment' then
        select to_jsonb(row) into v_previous from public."social_attachments" row where row."id" = v_target_uuid;
        update public."social_attachments"
          set "moderation_status" = v_next_status
          where "id" = v_target_uuid;
        select to_jsonb(row) into v_new from public."social_attachments" row where row."id" = v_target_uuid;
      when 'social_attachment' then
        select to_jsonb(row) into v_previous from public."social_attachments" row where row."id" = v_target_uuid;
        update public."social_attachments"
          set "moderation_status" = v_next_status
          where "id" = v_target_uuid;
        select to_jsonb(row) into v_new from public."social_attachments" row where row."id" = v_target_uuid;
      else
        raise exception 'dmca_content_type_not_supported_for_disable_restore';
    end case;

    if v_previous is null or v_new is null then
      raise exception 'dmca_content_not_found';
    end if;
  end if;

  insert into public."dmca_content_actions" (
    "dmca_case_id",
    "content_type",
    "content_id",
    "action",
    "previous_state",
    "new_state",
    "actor_admin_id",
    "reason"
  ) values (
    p_case_id,
    p_content_type,
    p_content_id,
    p_action,
    v_previous,
    v_new,
    v_actor,
    p_reason
  )
  returning * into v_row;

  if p_action in ('disabled', 'hidden') then
    update public."dmca_cases"
      set "status" = 'content_disabled',
          "updated_at" = timezone('utc'::text, now())
      where "id" = p_case_id;
    v_event_type := 'content_disabled';
  elsif p_action = 'restored' then
    update public."dmca_cases"
      set "status" = 'restored',
          "closed_at" = timezone('utc'::text, now()),
          "updated_at" = timezone('utc'::text, now())
      where "id" = p_case_id;
    v_event_type := 'content_restored';
  else
    v_event_type := 'case_updated';
  end if;

  perform public."dmca_write_audit"(
    p_case_id,
    v_event_type,
    'admin',
    p_reason,
    jsonb_build_object(
      'content_type', p_content_type,
      'content_id', p_content_id,
      'action', p_action
    )
  );

  return v_row;
end;
$$;

create or replace function public."admin_dmca_add_strike"(
  p_case_id uuid,
  p_user_id text,
  p_channel_id text,
  p_content_type text,
  p_content_id text,
  p_severity text,
  p_reason text
)
returns public."dmca_strikes"
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public."dmca_strikes";
  v_active_count integer := 0;
begin
  perform public."dmca_assert_owner_operator"();

  if nullif(trim(coalesce(p_user_id, '')), '') is null then
    raise exception 'dmca_strike_user_required';
  end if;
  if p_severity not in ('standard', 'severe') then
    p_severity := 'standard';
  end if;

  insert into public."dmca_strikes" (
    "user_id",
    "channel_id",
    "dmca_case_id",
    "content_type",
    "content_id",
    "severity",
    "reason"
  ) values (
    trim(p_user_id),
    nullif(trim(coalesce(p_channel_id, '')), ''),
    p_case_id,
    p_content_type,
    p_content_id,
    p_severity,
    p_reason
  )
  returning * into v_row;

  perform public."dmca_write_audit"(
    p_case_id,
    'strike_added',
    'admin',
    p_reason,
    jsonb_build_object('user_id', p_user_id, 'content_type', p_content_type, 'severity', p_severity)
  );

  select count(*) into v_active_count
  from public."dmca_strikes"
  where "user_id" = trim(p_user_id)
    and "strike_status" = 'active';

  if v_active_count >= 3 or p_severity = 'severe' then
    update public."dmca_cases"
      set "status" = 'repeat_infringer_review',
          "updated_at" = timezone('utc'::text, now())
      where "id" = p_case_id;
    perform public."dmca_write_audit"(
      p_case_id,
      'repeat_infringer_review_opened',
      'system',
      'Repeat-infringer review opened by active copyright strike threshold or severe strike.',
      jsonb_build_object('active_strike_count', v_active_count, 'severity', p_severity)
    );
  end if;

  return v_row;
end;
$$;

create or replace function public."admin_dmca_remove_strike"(
  p_strike_id uuid,
  p_removed_reason text
)
returns public."dmca_strikes"
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public."dmca_strikes";
begin
  perform public."dmca_assert_owner_operator"();

  update public."dmca_strikes"
    set "strike_status" = 'removed',
        "removed_at" = timezone('utc'::text, now()),
        "removed_reason" = p_removed_reason
    where "id" = p_strike_id
  returning * into v_row;

  if v_row."id" is null then
    raise exception 'dmca_strike_not_found';
  end if;

  perform public."dmca_write_audit"(
    v_row."dmca_case_id",
    'strike_removed',
    'admin',
    p_removed_reason,
    jsonb_build_object('strike_id', p_strike_id)
  );

  return v_row;
end;
$$;

create or replace function public."admin_dmca_record_counter_notice"(
  p_case_id uuid,
  p_payload jsonb,
  p_forwarded_to_claimant boolean default false
)
returns public."dmca_counter_notices"
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamp with time zone := timezone('utc'::text, now());
  v_row public."dmca_counter_notices";
  v_name text := nullif(trim(coalesce(p_payload->>'submitterName', p_payload->>'submitter_name', '')), '');
  v_email text := lower(nullif(trim(coalesce(p_payload->>'submitterEmail', p_payload->>'submitter_email', '')), ''));
  v_description text := nullif(trim(coalesce(p_payload->>'removedMaterialDescription', p_payload->>'removed_material_description', '')), '');
  v_location text := nullif(trim(coalesce(p_payload->>'removedMaterialUrlOrLocation', p_payload->>'removed_material_url_or_location', '')), '');
  v_signature text := nullif(trim(coalesce(p_payload->>'electronicSignature', p_payload->>'electronic_signature', '')), '');
begin
  perform public."dmca_assert_owner_operator"();

  if v_name is null then raise exception 'counter_notice_submitter_name_required'; end if;
  if v_email is null or position('@' in v_email) <= 1 then raise exception 'counter_notice_email_required'; end if;
  if v_description is null then raise exception 'counter_notice_removed_material_description_required'; end if;
  if v_location is null then raise exception 'counter_notice_removed_material_location_required'; end if;
  if coalesce((p_payload->>'goodFaithMistakeStatement')::boolean, (p_payload->>'good_faith_mistake_statement')::boolean, false) is not true then
    raise exception 'counter_notice_good_faith_statement_required';
  end if;
  if coalesce((p_payload->>'jurisdictionConsentStatement')::boolean, (p_payload->>'jurisdiction_consent_statement')::boolean, false) is not true then
    raise exception 'counter_notice_jurisdiction_statement_required';
  end if;
  if coalesce((p_payload->>'serviceAcceptanceStatement')::boolean, (p_payload->>'service_acceptance_statement')::boolean, false) is not true then
    raise exception 'counter_notice_service_statement_required';
  end if;
  if v_signature is null then raise exception 'counter_notice_signature_required'; end if;

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
    "forwarded_to_claimant_at",
    "response_deadline_start_at",
    "restore_not_before_at",
    "restore_not_after_at",
    "status"
  ) values (
    p_case_id,
    nullif(trim(coalesce(p_payload->>'submitterUserId', p_payload->>'submitter_user_id', '')), ''),
    v_name,
    v_email,
    nullif(trim(coalesce(p_payload->>'submitterPhone', p_payload->>'submitter_phone', '')), ''),
    nullif(trim(coalesce(p_payload->>'submitterAddress', p_payload->>'submitter_address', '')), ''),
    v_description,
    v_location,
    true,
    true,
    true,
    v_signature,
    case when p_forwarded_to_claimant then v_now else null end,
    case when p_forwarded_to_claimant then v_now else null end,
    case when p_forwarded_to_claimant then public."dmca_add_business_days"(v_now, 10) else null end,
    case when p_forwarded_to_claimant then public."dmca_add_business_days"(v_now, 14) else null end,
    case when p_forwarded_to_claimant then 'waiting' else 'received' end
  )
  returning * into v_row;

  update public."dmca_cases"
    set "status" = case when p_forwarded_to_claimant then 'waiting_rightsholder_response' else 'counter_notice_received' end,
        "updated_at" = v_now
    where "id" = p_case_id;

  perform public."dmca_write_audit"(p_case_id, 'counter_notice_received', 'admin', 'Counter-notice recorded by admin.', jsonb_build_object('counter_notice_id', v_row."id"));

  if p_forwarded_to_claimant then
    perform public."dmca_write_audit"(p_case_id, 'counter_notice_forwarded', 'admin', 'Counter-notice forwarding to claimant recorded.', jsonb_build_object('counter_notice_id', v_row."id"));
    perform public."dmca_write_audit"(p_case_id, 'waiting_window_started', 'system', '10-14 business-day response window started.', jsonb_build_object(
      'counter_notice_id', v_row."id",
      'restore_not_before_at', v_row."restore_not_before_at",
      'restore_not_after_at', v_row."restore_not_after_at"
    ));
  end if;

  return v_row;
end;
$$;

create or replace function public."admin_dmca_forward_counter_notice"(
  p_counter_notice_id uuid,
  p_reason text
)
returns public."dmca_counter_notices"
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamp with time zone := timezone('utc'::text, now());
  v_row public."dmca_counter_notices";
begin
  perform public."dmca_assert_owner_operator"();

  update public."dmca_counter_notices"
    set "forwarded_to_claimant_at" = coalesce("forwarded_to_claimant_at", v_now),
        "response_deadline_start_at" = coalesce("response_deadline_start_at", v_now),
        "restore_not_before_at" = coalesce("restore_not_before_at", public."dmca_add_business_days"(v_now, 10)),
        "restore_not_after_at" = coalesce("restore_not_after_at", public."dmca_add_business_days"(v_now, 14)),
        "status" = 'waiting',
        "updated_at" = v_now
    where "id" = p_counter_notice_id
  returning * into v_row;

  if v_row."id" is null then raise exception 'counter_notice_not_found'; end if;

  update public."dmca_cases"
    set "status" = 'waiting_rightsholder_response',
        "updated_at" = v_now
    where "id" = v_row."dmca_case_id";

  perform public."dmca_write_audit"(v_row."dmca_case_id", 'counter_notice_forwarded', 'admin', p_reason, jsonb_build_object('counter_notice_id', p_counter_notice_id));
  perform public."dmca_write_audit"(v_row."dmca_case_id", 'waiting_window_started', 'system', '10-14 business-day response window started.', jsonb_build_object(
    'counter_notice_id', p_counter_notice_id,
    'restore_not_before_at', v_row."restore_not_before_at",
    'restore_not_after_at', v_row."restore_not_after_at"
  ));

  return v_row;
end;
$$;

create or replace function public."admin_dmca_record_court_action"(
  p_counter_notice_id uuid,
  p_reason text
)
returns public."dmca_counter_notices"
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public."dmca_counter_notices";
begin
  perform public."dmca_assert_owner_operator"();

  update public."dmca_counter_notices"
    set "court_action_notice_received_at" = timezone('utc'::text, now()),
        "status" = 'blocked_by_court_action',
        "updated_at" = timezone('utc'::text, now())
    where "id" = p_counter_notice_id
  returning * into v_row;

  if v_row."id" is null then raise exception 'counter_notice_not_found'; end if;

  update public."dmca_cases"
    set "status" = 'court_action_notice_received',
        "updated_at" = timezone('utc'::text, now())
    where "id" = v_row."dmca_case_id";

  perform public."dmca_write_audit"(v_row."dmca_case_id", 'court_action_notice_recorded', 'admin', p_reason, jsonb_build_object('counter_notice_id', p_counter_notice_id));

  return v_row;
end;
$$;

create or replace function public."admin_dmca_mark_restore_eligible"(
  p_case_id uuid,
  p_counter_notice_id uuid,
  p_reason text
)
returns public."dmca_cases"
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case public."dmca_cases";
begin
  perform public."dmca_assert_owner_operator"();

  update public."dmca_counter_notices"
    set "status" = 'eligible_for_restore',
        "updated_at" = timezone('utc'::text, now())
    where "id" = p_counter_notice_id
      and "dmca_case_id" = p_case_id
      and "status" <> 'blocked_by_court_action';

  update public."dmca_cases"
    set "status" = 'eligible_for_restore',
        "updated_at" = timezone('utc'::text, now())
    where "id" = p_case_id
  returning * into v_case;

  if v_case."id" is null then raise exception 'dmca_case_not_found'; end if;

  perform public."dmca_write_audit"(p_case_id, 'restore_eligible', 'admin', p_reason, jsonb_build_object('counter_notice_id', p_counter_notice_id));

  return v_case;
end;
$$;

revoke all on function public."dmca_safe_uuid"(text) from public;
revoke all on function public."dmca_add_business_days"(timestamp with time zone, integer) from public;
revoke all on function public."dmca_next_case_number"() from public;
revoke all on function public."dmca_assert_owner_operator"() from public;
revoke all on function public."dmca_resolve_uploader_user_id"(text, text) from public;
revoke all on function public."dmca_write_audit"(uuid, text, text, text, jsonb) from public;

grant execute on function public."submit_dmca_notice"(jsonb) to "anon";
grant execute on function public."submit_dmca_notice"(jsonb) to "authenticated";
grant execute on function public."admin_dmca_set_case_status"(uuid, text, text, text) to "authenticated";
grant execute on function public."admin_dmca_record_content_action"(uuid, text, text, text, text) to "authenticated";
grant execute on function public."admin_dmca_add_strike"(uuid, text, text, text, text, text, text) to "authenticated";
grant execute on function public."admin_dmca_remove_strike"(uuid, text) to "authenticated";
grant execute on function public."admin_dmca_record_counter_notice"(uuid, jsonb, boolean) to "authenticated";
grant execute on function public."admin_dmca_forward_counter_notice"(uuid, text) to "authenticated";
grant execute on function public."admin_dmca_record_court_action"(uuid, text) to "authenticated";
grant execute on function public."admin_dmca_mark_restore_eligible"(uuid, uuid, text) to "authenticated";

comment on function public."submit_dmca_notice"(jsonb) is
  'Validated public DMCA notice intake. Returns only case id, case number, and status; full reporter data remains admin-only.';
comment on function public."admin_dmca_record_content_action"(uuid, text, text, text, text) is
  'Owner/operator-only DMCA content action RPC. Supports hide/disable/restore for existing moderation-status surfaces only.';
