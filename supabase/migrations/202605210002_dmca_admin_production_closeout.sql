-- Production closeout for DMCA admin case handling.
-- Keeps public notice intake separate from owner/operator manual intake, adds
-- scoped copyright permissions, and preserves functional DMCA case history.

create or replace function public."platform_staff_normalize_permission_key"(p_permission_key text)
returns text
language sql
immutable
set search_path = public
as $$
  select case lower(trim(coalesce(p_permission_key, '')))
    when 'support_inbox' then 'support_inbox'
    when 'user_lookup' then 'user_lookup'
    when 'content_moderation' then 'content_moderation'
    when 'reports_review' then 'reports_review'
    when 'live_ops' then 'live_ops'
    when 'billing_support_read' then 'billing_support_read'
    when 'creator_support' then 'creator_support'
    when 'legal_review' then 'legal_review'
    when 'dmca_review' then 'dmca_review'
    when 'copyright_review' then 'copyright_review'
    when 'evidence_export' then 'evidence_export'
    when 'emergency_break_glass' then 'emergency_break_glass'
    when 'admin_grants' then 'admin_grants'
    when 'manage_moderators' then 'manage_moderators'
    when 'moderator_grants' then 'manage_moderators'
    when 'audit_review' then 'audit_review'
    when 'security_review' then 'security_review'
    when 'staff_permission_templates' then 'staff_permission_templates'
    when 'legal_request_intake' then 'legal_request_intake'
    else null
  end;
$$;

alter table if exists public."platform_staff_permission_grants"
  drop constraint if exists "platform_staff_permission_grants_permission_check";

alter table if exists public."platform_staff_permission_grants"
  add constraint "platform_staff_permission_grants_permission_check"
    check ("permission_key" in (
      'support_inbox',
      'user_lookup',
      'content_moderation',
      'reports_review',
      'live_ops',
      'billing_support_read',
      'creator_support',
      'legal_review',
      'dmca_review',
      'copyright_review',
      'evidence_export',
      'emergency_break_glass',
      'admin_grants',
      'manage_moderators',
      'audit_review',
      'security_review',
      'staff_permission_templates',
      'legal_request_intake'
    ));

alter table if exists public."platform_staff_permission_audit"
  drop constraint if exists "platform_staff_permission_audit_permission_check";

alter table if exists public."platform_staff_permission_audit"
  add constraint "platform_staff_permission_audit_permission_check"
    check ("permission_key" in (
      'support_inbox',
      'user_lookup',
      'content_moderation',
      'reports_review',
      'live_ops',
      'billing_support_read',
      'creator_support',
      'legal_review',
      'dmca_review',
      'copyright_review',
      'evidence_export',
      'emergency_break_glass',
      'admin_grants',
      'manage_moderators',
      'audit_review',
      'security_review',
      'staff_permission_templates',
      'legal_request_intake'
    ));

create or replace function public."read_my_platform_staff_permission_keys"()
returns text[]
language sql
security definer
set search_path = public
as $$
  with known(permission_key) as (
    values
      ('support_inbox'::text),
      ('user_lookup'::text),
      ('content_moderation'::text),
      ('reports_review'::text),
      ('live_ops'::text),
      ('billing_support_read'::text),
      ('creator_support'::text),
      ('legal_review'::text),
      ('dmca_review'::text),
      ('copyright_review'::text),
      ('evidence_export'::text),
      ('emergency_break_glass'::text),
      ('admin_grants'::text),
      ('manage_moderators'::text),
      ('audit_review'::text),
      ('security_review'::text),
      ('staff_permission_templates'::text),
      ('legal_request_intake'::text)
  )
  select case
    when auth.uid() is null then array[]::text[]
    when public.has_platform_role(array['owner'::text]) then array(select permission_key from known order by permission_key)
    else coalesce(array(
      select distinct grant_row."permission_key"
      from public."platform_staff_permission_grants" grant_row
      where grant_row."status" = 'active'
        and grant_row."permission_key" in (select permission_key from known)
        and (grant_row."expires_at" is null or grant_row."expires_at" > timezone('utc'::text, now()))
        and (
          grant_row."target_user_id" = auth.uid()::text
          or lower(grant_row."target_email") = public.platform_staff_normalize_email(auth.jwt() ->> 'email')
        )
      order by grant_row."permission_key"
    ), array[]::text[])
  end;
$$;

alter table if exists public."dmca_cases"
  add column if not exists "copyright_owner_name" text,
  add column if not exists "allegedly_infringing_material_description" text;

alter table if exists public."dmca_cases"
  drop constraint if exists "dmca_cases_status_check",
  drop constraint if exists "dmca_cases_source_check";

alter table if exists public."dmca_cases"
  add constraint "dmca_cases_status_check" check ("status" in (
    'received',
    'needs_more_info',
    'under_review',
    'rejected',
    'rejected_no_action',
    'content_disabled',
    'uploader_notified',
    'counter_notice_received',
    'waiting_rightsholder_response',
    'eligible_for_restore',
    'restored',
    'court_action_notice_received',
    'repeat_infringer_review',
    'closed',
    'preserved_evidence'
  )),
  add constraint "dmca_cases_source_check" check ("source" in (
    'public_form',
    'in_app_report',
    'support_email_manual',
    'admin_created',
    'admin_manual',
    'manual_email',
    'support_form'
  ));

alter table if exists public."dmca_strikes"
  drop constraint if exists "dmca_strikes_status_check";

alter table if exists public."dmca_strikes"
  add constraint "dmca_strikes_status_check"
    check ("strike_status" in ('active', 'removed', 'disputed', 'resolved', 'expired'));

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

create or replace function public."dmca_can_access_admin"()
returns boolean
language sql
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and (
      public.has_platform_role(array['owner'::text])
      or (
        public.has_platform_role(array['operator'::text])
        and (
          public.has_platform_permission('dmca_review')
          or public.has_platform_permission('copyright_review')
          or public.has_platform_permission('legal_review')
        )
      )
    );
$$;

create or replace function public."dmca_assert_owner_operator"()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public."dmca_can_access_admin"() then
    raise exception 'dmca_owner_or_scoped_operator_required';
  end if;
end;
$$;

drop policy if exists "dmca_cases_select_owner_operator" on public."dmca_cases";
drop policy if exists "dmca_cases_select_authorized" on public."dmca_cases";
create policy "dmca_cases_select_authorized"
  on public."dmca_cases"
  for select
  to authenticated
  using (public."dmca_can_access_admin"());

drop policy if exists "dmca_counter_notices_select_owner_operator" on public."dmca_counter_notices";
drop policy if exists "dmca_counter_notices_select_authorized" on public."dmca_counter_notices";
create policy "dmca_counter_notices_select_authorized"
  on public."dmca_counter_notices"
  for select
  to authenticated
  using (public."dmca_can_access_admin"());

drop policy if exists "dmca_content_actions_select_owner_operator" on public."dmca_content_actions";
drop policy if exists "dmca_content_actions_select_authorized" on public."dmca_content_actions";
create policy "dmca_content_actions_select_authorized"
  on public."dmca_content_actions"
  for select
  to authenticated
  using (public."dmca_can_access_admin"());

drop policy if exists "dmca_strikes_select_owner_operator" on public."dmca_strikes";
drop policy if exists "dmca_strikes_select_authorized" on public."dmca_strikes";
create policy "dmca_strikes_select_authorized"
  on public."dmca_strikes"
  for select
  to authenticated
  using (public."dmca_can_access_admin"());

drop policy if exists "dmca_audit_log_select_owner_operator" on public."dmca_audit_log";
drop policy if exists "dmca_audit_log_select_authorized" on public."dmca_audit_log";
create policy "dmca_audit_log_select_authorized"
  on public."dmca_audit_log"
  for select
  to authenticated
  using (public."dmca_can_access_admin"());

create or replace function public."admin_dmca_create_case"(
  p_payload jsonb,
  p_source text default 'admin_manual'
)
returns public."dmca_cases"
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reporter_name text := nullif(trim(coalesce(p_payload->>'claimantName', p_payload->>'reporterName', p_payload->>'reporter_name', '')), '');
  v_reporter_email text := lower(nullif(trim(coalesce(p_payload->>'claimantEmail', p_payload->>'reporterEmail', p_payload->>'reporter_email', '')), ''));
  v_work_description text := nullif(trim(coalesce(p_payload->>'copyrightedWorkDescription', p_payload->>'copyrighted_work_description', '')), '');
  v_material_description text := nullif(trim(coalesce(p_payload->>'infringingMaterialDescription', p_payload->>'allegedlyInfringingMaterialDescription', p_payload->>'allegedly_infringing_material_description', '')), '');
  v_content_type text := lower(nullif(trim(coalesce(p_payload->>'contentType', p_payload->>'allegedlyInfringingContentType', p_payload->>'allegedly_infringing_content_type', 'other')), ''));
  v_content_id text := nullif(trim(coalesce(p_payload->>'contentId', p_payload->>'allegedlyInfringingContentId', p_payload->>'allegedly_infringing_content_id', '')), '');
  v_content_url text := nullif(trim(coalesce(p_payload->>'contentUrl', p_payload->>'allegedlyInfringingUrl', p_payload->>'allegedly_infringing_url', '')), '');
  v_signature text := nullif(trim(coalesce(p_payload->>'electronicSignature', p_payload->>'electronic_signature', '')), '');
  v_source text := lower(trim(coalesce(p_source, 'admin_manual')));
  v_case_number text;
  v_case public."dmca_cases";
begin
  perform public."dmca_assert_owner_operator"();

  if v_reporter_name is null then raise exception 'reporter_name_required'; end if;
  if v_reporter_email is null or position('@' in v_reporter_email) <= 1 then raise exception 'valid_reporter_email_required'; end if;
  if v_work_description is null then raise exception 'copyrighted_work_description_required'; end if;
  if v_material_description is null then raise exception 'infringing_material_description_required'; end if;
  if v_content_id is null and v_content_url is null then raise exception 'infringing_content_location_required'; end if;
  if coalesce((p_payload->>'goodFaithStatement')::boolean, (p_payload->>'good_faith_statement')::boolean, false) is not true then
    raise exception 'good_faith_statement_required';
  end if;
  if coalesce((p_payload->>'accuracyPenaltyPerjuryStatement')::boolean, (p_payload->>'authorityStatement')::boolean, (p_payload->>'accuracy_penalty_perjury_statement')::boolean, false) is not true then
    raise exception 'accuracy_penalty_perjury_statement_required';
  end if;
  if v_signature is null then raise exception 'electronic_signature_required'; end if;

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

  v_source := case v_source
    when 'public' then 'public_form'
    when 'public_form' then 'public_form'
    when 'in_app_report' then 'in_app_report'
    when 'support' then 'support_email_manual'
    when 'support_email_manual' then 'support_email_manual'
    when 'email' then 'support_email_manual'
    when 'manual_email' then 'manual_email'
    when 'admin' then 'admin_manual'
    when 'admin_manual' then 'admin_manual'
    when 'admin_created' then 'admin_created'
    else 'admin_manual'
  end;

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
    "assigned_admin_id",
    "public_safe_summary"
  ) values (
    v_case_number,
    'received',
    'dmca_notice',
    nullif(auth.uid()::text, ''),
    v_reporter_name,
    nullif(trim(coalesce(p_payload->>'claimantCompany', p_payload->>'reporterCompany', p_payload->>'reporter_company', '')), ''),
    v_reporter_email,
    nullif(trim(coalesce(p_payload->>'reporterPhone', p_payload->>'reporter_phone', '')), ''),
    nullif(trim(coalesce(p_payload->>'reporterAddress', p_payload->>'reporter_address', '')), ''),
    coalesce((p_payload->>'reporterIsOwner')::boolean, (p_payload->>'reporter_is_owner')::boolean, true),
    nullif(trim(coalesce(p_payload->>'authorizedAgentName', p_payload->>'authorized_agent_name', '')), ''),
    nullif(trim(coalesce(p_payload->>'copyrightOwnerName', p_payload->>'copyright_owner_name', v_reporter_name, '')), ''),
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
    v_source,
    nullif(auth.uid()::text, ''),
    left(v_work_description, 240)
  )
  returning * into v_case;

  perform public."dmca_write_audit"(
    v_case."id",
    'case_created',
    'admin',
    'Formal DMCA notice manually recorded by owner/operator.',
    jsonb_build_object(
      'source', v_source,
      'content_type', v_content_type,
      'content_id_present', v_content_id is not null,
      'content_url_present', v_content_url is not null
    )
  );

  return v_case;
end;
$$;

create or replace function public."admin_dmca_get_content_state"(
  p_content_type text,
  p_content_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_uuid uuid := public."dmca_safe_uuid"(p_content_id);
  v_state jsonb;
begin
  perform public."dmca_assert_owner_operator"();

  if nullif(trim(coalesce(p_content_id, '')), '') is null then
    return jsonb_build_object('found', false, 'publicAvailability', 'unknown', 'reason', 'content_id_required');
  end if;

  if v_target_uuid is null then
    return jsonb_build_object('found', false, 'publicAvailability', 'unknown', 'reason', 'content_uuid_required_for_backed_state');
  end if;

  case p_content_type
    when 'creator_video' then
      select jsonb_build_object(
        'found', true,
        'backend', 'videos',
        'contentType', p_content_type,
        'contentId', video."id",
        'ownerUserId', video."owner_id",
        'visibility', video."visibility",
        'moderationStatus', video."moderation_status",
        'moderationReason', video."moderation_reason",
        'moderatedAt', video."moderated_at",
        'deletedAt', null,
        'publicAvailability', case when video."visibility" = 'public' and video."moderation_status" in ('clean', 'reported') then 'public' else 'restricted' end
      ) into v_state
      from public."videos" video
      where video."id" = v_target_uuid;
    when 'profile_post' then
      select jsonb_build_object(
        'found', true,
        'backend', 'profile_posts',
        'contentType', p_content_type,
        'contentId', post."id",
        'ownerUserId', post."user_id",
        'visibility', post."visibility",
        'moderationStatus', post."moderation_status",
        'moderationReason', post."moderation_reason",
        'moderatedAt', post."moderated_at",
        'deletedAt', post."deleted_at",
        'publicAvailability', case when post."deleted_at" is null and post."visibility" = 'public' and post."moderation_status" in ('clean', 'reported') then 'public' else 'restricted' end
      ) into v_state
      from public."profile_posts" post
      where post."id" = v_target_uuid;
    when 'profile_post_comment' then
      select jsonb_build_object(
        'found', true,
        'backend', 'profile_post_comments',
        'contentType', p_content_type,
        'contentId', comment."id",
        'ownerUserId', comment."user_id",
        'visibility', null,
        'moderationStatus', comment."moderation_status",
        'moderationReason', comment."moderation_reason",
        'moderatedAt', comment."moderated_at",
        'deletedAt', comment."deleted_at",
        'publicAvailability', case when comment."deleted_at" is null and comment."moderation_status" in ('clean', 'reported') then 'public_if_parent_public' else 'restricted' end
      ) into v_state
      from public."profile_post_comments" comment
      where comment."id" = v_target_uuid;
    when 'comment' then
      select jsonb_build_object(
        'found', true,
        'backend', 'profile_post_comments',
        'contentType', p_content_type,
        'contentId', comment."id",
        'ownerUserId', comment."user_id",
        'visibility', null,
        'moderationStatus', comment."moderation_status",
        'moderationReason', comment."moderation_reason",
        'moderatedAt', comment."moderated_at",
        'deletedAt', comment."deleted_at",
        'publicAvailability', case when comment."deleted_at" is null and comment."moderation_status" in ('clean', 'reported') then 'public_if_parent_public' else 'restricted' end
      ) into v_state
      from public."profile_post_comments" comment
      where comment."id" = v_target_uuid;
    when 'creator_video_comment' then
      select jsonb_build_object(
        'found', true,
        'backend', 'creator_video_comments',
        'contentType', p_content_type,
        'contentId', comment."id",
        'ownerUserId', comment."user_id",
        'visibility', null,
        'moderationStatus', comment."moderation_status",
        'moderationReason', comment."moderation_reason",
        'moderatedAt', comment."moderated_at",
        'deletedAt', comment."deleted_at",
        'publicAvailability', case when comment."deleted_at" is null and comment."moderation_status" in ('clean', 'reported') then 'public_if_parent_public' else 'restricted' end
      ) into v_state
      from public."creator_video_comments" comment
      where comment."id" = v_target_uuid;
    when 'reply' then
      select jsonb_build_object(
        'found', true,
        'backend', 'creator_video_comments',
        'contentType', p_content_type,
        'contentId', comment."id",
        'ownerUserId', comment."user_id",
        'visibility', null,
        'moderationStatus', comment."moderation_status",
        'moderationReason', comment."moderation_reason",
        'moderatedAt', comment."moderated_at",
        'deletedAt', comment."deleted_at",
        'publicAvailability', case when comment."deleted_at" is null and comment."moderation_status" in ('clean', 'reported') then 'public_if_parent_public' else 'restricted' end
      ) into v_state
      from public."creator_video_comments" comment
      where comment."id" = v_target_uuid;
    when 'social_attachment' then
      select jsonb_build_object(
        'found', true,
        'backend', 'social_attachments',
        'contentType', p_content_type,
        'contentId', attachment."id",
        'ownerUserId', attachment."owner_user_id",
        'visibility', null,
        'moderationStatus', attachment."moderation_status",
        'moderationReason', attachment."moderation_reason",
        'moderatedAt', attachment."moderated_at",
        'deletedAt', attachment."deleted_at",
        'publicAvailability', case when attachment."deleted_at" is null and attachment."moderation_status" in ('clean', 'reported') then 'public_if_parent_public' else 'restricted' end
      ) into v_state
      from public."social_attachments" attachment
      where attachment."id" = v_target_uuid;
    when 'attachment' then
      select jsonb_build_object(
        'found', true,
        'backend', 'social_attachments',
        'contentType', p_content_type,
        'contentId', attachment."id",
        'ownerUserId', attachment."owner_user_id",
        'visibility', null,
        'moderationStatus', attachment."moderation_status",
        'moderationReason', attachment."moderation_reason",
        'moderatedAt', attachment."moderated_at",
        'deletedAt', attachment."deleted_at",
        'publicAvailability', case when attachment."deleted_at" is null and attachment."moderation_status" in ('clean', 'reported') then 'public_if_parent_public' else 'restricted' end
      ) into v_state
      from public."social_attachments" attachment
      where attachment."id" = v_target_uuid;
    else
      return jsonb_build_object(
        'found', false,
        'publicAvailability', 'unknown',
        'reason', 'dmca_content_type_not_supported_for_state_lookup',
        'missingBackendPiece', concat('admin_dmca_get_content_state support for ', coalesce(p_content_type, 'unknown'))
      );
  end case;

  return coalesce(v_state, jsonb_build_object('found', false, 'publicAvailability', 'unknown', 'reason', 'dmca_content_not_found'));
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
    'rejected_no_action',
    'content_disabled',
    'uploader_notified',
    'counter_notice_received',
    'waiting_rightsholder_response',
    'eligible_for_restore',
    'restored',
    'court_action_notice_received',
    'repeat_infringer_review',
    'closed',
    'preserved_evidence'
  ) then
    raise exception 'invalid_dmca_case_status';
  end if;

  if p_status = 'needs_more_info' then
    v_event_type := 'notice_marked_incomplete';
  elsif p_status in ('rejected', 'rejected_no_action') then
    v_event_type := 'notice_rejected';
  elsif p_status = 'uploader_notified' then
    v_event_type := 'uploader_notification_recorded';
  elsif p_status = 'eligible_for_restore' then
    v_event_type := 'restore_eligible';
  elsif p_status = 'repeat_infringer_review' then
    v_event_type := 'repeat_infringer_review_opened';
  elsif p_status = 'preserved_evidence' then
    v_event_type := 'evidence_preserved';
  end if;

  update public."dmca_cases"
  set
    "status" = p_status,
    "assigned_admin_id" = coalesce("assigned_admin_id", nullif(auth.uid()::text, '')),
    "admin_notes" = coalesce(nullif(trim(coalesce(p_admin_notes, '')), ''), "admin_notes"),
    "closed_at" = case when p_status in ('closed', 'rejected', 'rejected_no_action', 'restored') then timezone('utc'::text, now()) else "closed_at" end,
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
  v_case_status text;
begin
  perform public."dmca_assert_owner_operator"();

  if v_actor is null then
    raise exception 'admin_actor_required';
  end if;
  if p_action not in ('disabled', 'hidden', 'restored', 'rejected_no_action', 'preserved_evidence') then
    raise exception 'invalid_dmca_content_action';
  end if;
  if nullif(trim(coalesce(p_content_id, '')), '') is null then
    raise exception 'dmca_content_id_required';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'dmca_action_reason_required';
  end if;

  if p_action = 'restored' and exists (
    select 1
    from public."dmca_counter_notices" counter_notice
    where counter_notice."dmca_case_id" = p_case_id
      and counter_notice."status" = 'blocked_by_court_action'
  ) then
    raise exception 'dmca_restore_blocked_by_court_action';
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
        select to_jsonb(video) into v_previous from public."videos" video where video."id" = v_target_uuid;
        update public."videos"
          set "moderation_status" = v_next_status,
              "moderation_reason" = p_reason,
              "moderated_at" = timezone('utc'::text, now()),
              "moderated_by" = v_actor,
              "updated_at" = timezone('utc'::text, now())
          where "id" = v_target_uuid;
        select to_jsonb(video) into v_new from public."videos" video where video."id" = v_target_uuid;
      when 'profile_post' then
        select to_jsonb(post) into v_previous from public."profile_posts" post where post."id" = v_target_uuid;
        update public."profile_posts"
          set "moderation_status" = v_next_status,
              "moderation_reason" = p_reason,
              "moderated_at" = timezone('utc'::text, now()),
              "moderated_by" = v_actor,
              "updated_at" = timezone('utc'::text, now())
          where "id" = v_target_uuid;
        select to_jsonb(post) into v_new from public."profile_posts" post where post."id" = v_target_uuid;
      when 'profile_post_comment' then
        select to_jsonb(comment) into v_previous from public."profile_post_comments" comment where comment."id" = v_target_uuid;
        update public."profile_post_comments"
          set "moderation_status" = v_next_status,
              "moderation_reason" = p_reason,
              "moderated_at" = timezone('utc'::text, now()),
              "moderated_by" = v_actor,
              "updated_at" = timezone('utc'::text, now())
          where "id" = v_target_uuid;
        select to_jsonb(comment) into v_new from public."profile_post_comments" comment where comment."id" = v_target_uuid;
      when 'comment' then
        select to_jsonb(comment) into v_previous from public."profile_post_comments" comment where comment."id" = v_target_uuid;
        update public."profile_post_comments"
          set "moderation_status" = v_next_status,
              "moderation_reason" = p_reason,
              "moderated_at" = timezone('utc'::text, now()),
              "moderated_by" = v_actor,
              "updated_at" = timezone('utc'::text, now())
          where "id" = v_target_uuid;
        select to_jsonb(comment) into v_new from public."profile_post_comments" comment where comment."id" = v_target_uuid;
      when 'creator_video_comment' then
        select to_jsonb(comment) into v_previous from public."creator_video_comments" comment where comment."id" = v_target_uuid;
        update public."creator_video_comments"
          set "moderation_status" = v_next_status,
              "moderation_reason" = p_reason,
              "moderated_at" = timezone('utc'::text, now()),
              "moderated_by" = v_actor,
              "updated_at" = timezone('utc'::text, now())
          where "id" = v_target_uuid;
        select to_jsonb(comment) into v_new from public."creator_video_comments" comment where comment."id" = v_target_uuid;
      when 'reply' then
        select to_jsonb(comment) into v_previous from public."creator_video_comments" comment where comment."id" = v_target_uuid;
        update public."creator_video_comments"
          set "moderation_status" = v_next_status,
              "moderation_reason" = p_reason,
              "moderated_at" = timezone('utc'::text, now()),
              "moderated_by" = v_actor,
              "updated_at" = timezone('utc'::text, now())
          where "id" = v_target_uuid;
        select to_jsonb(comment) into v_new from public."creator_video_comments" comment where comment."id" = v_target_uuid;
      when 'attachment' then
        select to_jsonb(attachment) into v_previous from public."social_attachments" attachment where attachment."id" = v_target_uuid;
        update public."social_attachments"
          set "moderation_status" = v_next_status,
              "moderation_reason" = p_reason,
              "moderated_at" = timezone('utc'::text, now()),
              "moderated_by" = v_actor,
              "updated_at" = timezone('utc'::text, now())
          where "id" = v_target_uuid;
        select to_jsonb(attachment) into v_new from public."social_attachments" attachment where attachment."id" = v_target_uuid;
      when 'social_attachment' then
        select to_jsonb(attachment) into v_previous from public."social_attachments" attachment where attachment."id" = v_target_uuid;
        update public."social_attachments"
          set "moderation_status" = v_next_status,
              "moderation_reason" = p_reason,
              "moderated_at" = timezone('utc'::text, now()),
              "moderated_by" = v_actor,
              "updated_at" = timezone('utc'::text, now())
          where "id" = v_target_uuid;
        select to_jsonb(attachment) into v_new from public."social_attachments" attachment where attachment."id" = v_target_uuid;
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
    v_case_status := 'content_disabled';
    v_event_type := 'content_disabled';
  elsif p_action = 'restored' then
    v_case_status := 'restored';
    v_event_type := 'content_restored';
  elsif p_action = 'rejected_no_action' then
    v_case_status := 'rejected_no_action';
    v_event_type := 'notice_rejected';
  elsif p_action = 'preserved_evidence' then
    v_case_status := 'preserved_evidence';
    v_event_type := 'evidence_preserved';
  else
    v_case_status := null;
    v_event_type := 'case_updated';
  end if;

  if v_case_status is not null then
    update public."dmca_cases"
      set "status" = v_case_status,
          "closed_at" = case when v_case_status in ('restored', 'rejected_no_action') then timezone('utc'::text, now()) else "closed_at" end,
          "updated_at" = timezone('utc'::text, now())
      where "id" = p_case_id;
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
  v_case_status text;
  v_active_count integer := 0;
begin
  perform public."dmca_assert_owner_operator"();

  select "status" into v_case_status from public."dmca_cases" where "id" = p_case_id;
  if v_case_status is null then
    raise exception 'dmca_case_not_found';
  end if;
  if v_case_status not in (
    'content_disabled',
    'uploader_notified',
    'counter_notice_received',
    'waiting_rightsholder_response',
    'eligible_for_restore',
    'restored',
    'repeat_infringer_review',
    'preserved_evidence',
    'closed'
  ) then
    raise exception 'dmca_valid_takedown_required';
  end if;
  if nullif(trim(coalesce(p_user_id, '')), '') is null then
    raise exception 'dmca_strike_user_required';
  end if;
  if nullif(trim(coalesce(p_content_id, '')), '') is null then
    raise exception 'dmca_strike_content_required';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'dmca_strike_reason_required';
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

create or replace function public."admin_dmca_update_strike_status"(
  p_strike_id uuid,
  p_status text,
  p_reason text
)
returns public."dmca_strikes"
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public."dmca_strikes";
  v_event_type text;
begin
  perform public."dmca_assert_owner_operator"();

  if p_status not in ('active', 'removed', 'disputed', 'resolved') then
    raise exception 'invalid_dmca_strike_status';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'dmca_strike_status_reason_required';
  end if;

  update public."dmca_strikes"
    set "strike_status" = p_status,
        "removed_at" = case when p_status in ('removed', 'resolved') then timezone('utc'::text, now()) else "removed_at" end,
        "removed_reason" = case when p_status in ('removed', 'resolved', 'disputed') then p_reason else "removed_reason" end
    where "id" = p_strike_id
  returning * into v_row;

  if v_row."id" is null then
    raise exception 'dmca_strike_not_found';
  end if;

  v_event_type := case
    when p_status = 'disputed' then 'strike_disputed'
    when p_status = 'resolved' then 'strike_resolved'
    when p_status = 'removed' then 'strike_removed'
    else 'case_updated'
  end;

  perform public."dmca_write_audit"(
    v_row."dmca_case_id",
    v_event_type,
    'admin',
    p_reason,
    jsonb_build_object('strike_id', p_strike_id, 'strike_status', p_status)
  );

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
begin
  return public."admin_dmca_update_strike_status"(p_strike_id, 'removed', p_removed_reason);
end;
$$;

revoke all on function public."dmca_can_access_admin"() from public;
revoke all on function public."admin_dmca_create_case"(jsonb, text) from public;
revoke all on function public."admin_dmca_get_content_state"(text, text) from public;
revoke all on function public."admin_dmca_update_strike_status"(uuid, text, text) from public;

grant execute on function public."admin_dmca_create_case"(jsonb, text) to "authenticated";
grant execute on function public."admin_dmca_get_content_state"(text, text) to "authenticated";
grant execute on function public."admin_dmca_update_strike_status"(uuid, text, text) to "authenticated";
grant execute on function public."dmca_can_access_admin"() to "authenticated";

comment on function public."dmca_can_access_admin"() is
  'Allows owner, or active operator/admin with legal_review, dmca_review, or copyright_review permission, to access Admin DMCA.';
comment on function public."admin_dmca_create_case"(jsonb, text) is
  'Owner/scoped-operator manual DMCA formal notice intake. Public users must use submit_dmca_notice(jsonb).';
comment on function public."admin_dmca_get_content_state"(text, text) is
  'Owner/scoped-operator DMCA content availability lookup for backed moderation surfaces.';
