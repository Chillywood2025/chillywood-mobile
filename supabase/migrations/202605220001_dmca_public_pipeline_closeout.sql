-- Public DMCA/legal pipeline closeout.
-- Keeps Admin DMCA intact while making public notice intake store the full
-- public form field set used by the hosted copyright-report page.

create or replace function public."submit_dmca_notice"(p_payload jsonb)
returns table("id" uuid, "case_number" text, "status" text)
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
    "public_safe_summary"
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
      'content_url_present', v_content_url is not null,
      'copyright_owner_present', v_copyright_owner_name is not null,
      'infringing_material_description_present', v_material_description is not null,
      'attachments', 'disabled_dmca_attachment_storage_scanning_retention_not_configured'
    )
  );

  return query
    select c."id", c."case_number", c."status"
    from public."dmca_cases" c
    where c."id" = v_case_id;
end;
$$;

grant execute on function public."submit_dmca_notice"(jsonb) to "anon";
grant execute on function public."submit_dmca_notice"(jsonb) to "authenticated";

comment on function public."submit_dmca_notice"(jsonb) is
  'Validated public DMCA notice intake. Stores the full public notice field set and returns only case id, case number, and status; full reporter data remains admin-only.';
