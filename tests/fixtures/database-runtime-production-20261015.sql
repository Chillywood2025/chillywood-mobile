-- Reconstructed catalog-only production prestate, verified 2026-10-15.
-- No production user rows or credentials. Exact body digests match for 16 of
-- 17 drifted functions. The untouched creator-event projector retains source
-- formatting equivalent to its previously audited live body; its exact live
-- whitespace was not recovered. See the adjacent provenance JSON.

CREATE OR REPLACE FUNCTION "public"."admin_grant_platform_role_by_email"(p_target_email text, p_role text, p_reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE "plpgsql"
VOLATILE
SECURITY DEFINER
CALLED ON NULL INPUT
PARALLEL UNSAFE
COST 100
SET search_path TO ''
AS $fixture$
declare
  v_target_email text:=public."platform_staff_normalize_email"(p_target_email);
  v_target_role text:=public."platform_staff_normalize_role"(p_role);
  v_target_ids uuid[];
  v_target_user_id uuid;
  v_membership_ids bigint[];
  v_membership_id bigint;
  v_result jsonb;
begin
  if not public."wave1_current_caller_authority_internal"()
    or not public."has_platform_role"(array['owner'::text,'operator'::text])
  then
    raise exception 'platform_staff_permission_denied';
  end if;
  if v_target_email is null then raise exception 'platform_staff_email_required'; end if;
  if v_target_role is null then raise exception 'platform_staff_role_invalid'; end if;

  select array_agg(subject."id" order by subject."id") into v_target_ids
  from auth.users subject
  where lower(trim(subject."email"))=v_target_email
    and subject."email_confirmed_at" is not null;
  if coalesce(cardinality(v_target_ids),0)<>1 then
    raise exception 'platform_role_exact_confirmed_subject_required';
  end if;
  v_target_user_id:=v_target_ids[1];

  select array_agg(membership."id" order by membership."id") into v_membership_ids
  from public."platform_role_memberships" membership
  where membership."role"=v_target_role
    and (
      lower(trim(coalesce(membership."email",'')))=v_target_email
      or membership."user_id"=v_target_user_id::text
    );
  if coalesce(cardinality(v_membership_ids),0)>1 then
    raise exception 'platform_role_membership_subject_ambiguous';
  end if;
  v_membership_id:=v_membership_ids[1];
  if v_membership_id is not null and exists (
    select 1 from public."platform_role_memberships" membership
    where membership."id"=v_membership_id
      and nullif(trim(coalesce(membership."user_id",'')),'') is not null
      and membership."user_id"<>v_target_user_id::text
  ) then
    raise exception 'platform_role_membership_subject_conflict';
  end if;

  if v_membership_id is null then
    insert into public."platform_role_memberships"(
      "role","user_id","email","status","notes","granted_by",
      "revoked_by","revoked_at"
    ) values (
      v_target_role,v_target_user_id::text,v_target_email,'revoked',
      'Exact confirmed subject staged for fresh staff grant.',auth.uid()::text,
      'subject-binding-staging',timezone('utc'::text,now())
    ) returning "id" into v_membership_id;
  else
    update public."platform_role_memberships"
    set "user_id"=v_target_user_id::text,"email"=v_target_email,
        "expires_at"=null,
        "updated_at"=timezone('utc'::text,now())
    where "id"=v_membership_id;
  end if;

  v_result:=public."admin_grant_platform_role_by_email_pre_subject_closeout"(
    v_target_email,v_target_role,p_reason
  );
  if not exists (
    select 1 from public."platform_role_memberships" membership
    where membership."id"=v_membership_id and membership."status"='active'
      and membership."user_id"=v_target_user_id::text
      and lower(trim(membership."email"))=v_target_email
  ) then
    raise exception 'platform_role_exact_subject_projection_failed';
  end if;
  return v_result||jsonb_build_object('userId',v_target_user_id);
end;
$fixture$;

CREATE OR REPLACE FUNCTION "public"."admin_grant_platform_role_by_email_pre_exact_subject_closure"(p_target_email text, p_role text, p_reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE "plpgsql"
VOLATILE
SECURITY DEFINER
CALLED ON NULL INPUT
PARALLEL UNSAFE
COST 100
SET search_path TO 'public'
AS $fixture$
declare
  v_actor_role text := public.platform_staff_actor_role();
  v_actor_user_id text := auth.uid()::text;
  v_actor_email text := public.platform_staff_normalize_email(auth.jwt() ->> 'email');
  v_target_email text := public.platform_staff_normalize_email(p_target_email);
  v_target_role text := public.platform_staff_normalize_role(p_role);
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_role_id bigint;
begin
  if auth.uid() is null then
    raise exception 'platform_staff_auth_required';
  end if;

  if v_target_email is null then
    raise exception 'platform_staff_email_required';
  end if;

  if v_target_role is null then
    raise exception 'platform_staff_role_invalid';
  end if;

  if v_target_role = 'owner' then
    perform public.platform_staff_write_audit(
      v_actor_user_id,
      v_actor_email,
      coalesce(v_actor_role, 'member'),
      v_target_email,
      'blocked',
      v_target_role,
      coalesce(v_reason, 'Owner grants require First Owner authority.'),
      jsonb_build_object('blocked_reason', 'owner_grant_requires_first_owner')
    );
    raise exception 'platform_staff_owner_grant_not_supported';
  end if;

  if v_actor_role <> 'owner' and v_target_email = v_actor_email then
    perform public.platform_staff_write_audit(
      v_actor_user_id,
      v_actor_email,
      coalesce(v_actor_role, 'member'),
      v_target_email,
      'blocked',
      v_target_role,
      coalesce(v_reason, 'Staff cannot grant roles to themselves.'),
      jsonb_build_object('blocked_reason', 'self_grant_blocked')
    );
    raise exception 'platform_staff_self_grant_denied';
  end if;

  if v_actor_role is null or not (
    (v_actor_role = 'owner' and v_target_role in ('operator', 'moderator'))
    or (v_actor_role = 'operator' and v_target_role = 'moderator' and public.has_platform_permission('manage_moderators'))
  ) then
    perform public.platform_staff_write_audit(
      v_actor_user_id,
      v_actor_email,
      coalesce(v_actor_role, 'member'),
      v_target_email,
      'blocked',
      v_target_role,
      coalesce(v_reason, 'Insufficient scoped staff-management permission.'),
      jsonb_build_object('blocked_reason', 'insufficient_permission')
    );
    raise exception 'platform_staff_permission_denied';
  end if;

  if v_reason is null or length(v_reason) < 6 then
    raise exception 'platform_staff_reason_required';
  end if;

  update public."platform_role_memberships"
  set
    "email" = v_target_email,
    "status" = 'active',
    "granted_by" = v_actor_user_id,
    "granted_at" = timezone('utc'::text, now()),
    "updated_at" = timezone('utc'::text, now()),
    "revoked_by" = null,
    "revoked_at" = null,
    "notes" = v_reason
  where lower("email") = v_target_email
    and "role" = v_target_role
  returning "id" into v_role_id;

  if v_role_id is null then
    insert into public."platform_role_memberships" (
      "role",
      "email",
      "status",
      "notes",
      "granted_by",
      "granted_at",
      "updated_at"
    )
    values (
      v_target_role,
      v_target_email,
      'active',
      v_reason,
      v_actor_user_id,
      timezone('utc'::text, now()),
      timezone('utc'::text, now())
    )
    returning "id" into v_role_id;
  end if;

  perform public.platform_staff_write_audit(
    v_actor_user_id,
    v_actor_email,
    v_actor_role,
    v_target_email,
    'grant',
    v_target_role,
    v_reason,
    jsonb_build_object(
      'internal_role', v_target_role,
      'display_role', case when v_target_role = 'operator' then 'admin' else v_target_role end,
      'permission_model', 'scoped',
      'moderator_staff_management_allowed', false
    )
  );

  return jsonb_build_object(
    'id', v_role_id,
    'email', v_target_email,
    'role', v_target_role,
    'displayRole', case when v_target_role = 'operator' then 'admin' else v_target_role end,
    'status', 'active'
  );
end;
$fixture$;

CREATE OR REPLACE FUNCTION "public"."admin_grant_platform_role_by_email_pre_subject_closeout"(p_target_email text, p_role text, p_reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE "plpgsql"
VOLATILE
SECURITY DEFINER
CALLED ON NULL INPUT
PARALLEL UNSAFE
COST 100
SET search_path TO ''
AS $fixture$
declare
  v_actor_role text := public."platform_staff_actor_role"();
  v_actor_user_id text := auth.uid()::text;
  v_actor_email text := public."platform_staff_normalize_email"(auth.jwt() ->> 'email');
  v_target_email text := public."platform_staff_normalize_email"(p_target_email);
  v_target_role text := public."platform_staff_normalize_role"(p_role);
  v_target_user_id uuid;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_membership_ids bigint[];
  v_membership_id bigint;
begin
  if not public."platform_exact_current_session_authority_internal"() then
    raise exception 'platform_staff_auth_required';
  end if;
  if v_target_email is null then raise exception 'platform_staff_email_required'; end if;
  if v_target_role is null then raise exception 'platform_staff_role_invalid'; end if;
  if v_target_role = 'owner' then raise exception 'platform_staff_owner_grant_not_supported'; end if;
  if v_reason is null or length(v_reason) < 6 then
    raise exception 'platform_staff_reason_required';
  end if;

  v_target_user_id := public."platform_resolve_exact_confirmed_subject_by_email_internal"(
    v_target_email
  );
  if public."is_account_access_restricted"(v_target_user_id::text) then
    raise exception 'target_not_active';
  end if;
  if v_actor_role <> 'owner' and v_target_user_id::text = v_actor_user_id then
    raise exception 'platform_staff_self_grant_denied';
  end if;
  if v_actor_role is null or not (
    (v_actor_role = 'owner' and v_target_role in ('operator', 'moderator'))
    or (v_actor_role = 'operator' and v_target_role = 'moderator'
      and public."has_platform_permission"('manage_moderators'))
  ) then
    raise exception 'platform_staff_permission_denied';
  end if;

  select array_agg(membership."id" order by membership."id")
  into v_membership_ids
  from public."platform_role_memberships" membership
  where membership."role" = v_target_role
    and (
      membership."user_id" = v_target_user_id::text
      or lower(trim(coalesce(membership."email", ''))) = v_target_email
    );

  if coalesce(cardinality(v_membership_ids), 0) > 1 then
    raise exception 'platform_role_membership_subject_ambiguous';
  end if;
  v_membership_id := v_membership_ids[1];

  if v_membership_id is not null and exists (
    select 1
    from public."platform_role_memberships" membership
    where membership."id" = v_membership_id
      and nullif(trim(coalesce(membership."user_id", '')), '') is not null
      and membership."user_id" <> v_target_user_id::text
  ) then
    raise exception 'platform_role_membership_subject_conflict';
  end if;

  if v_membership_id is null then
    insert into public."platform_role_memberships" (
      "role", "user_id", "email", "status", "notes", "granted_by",
      "granted_at", "updated_at", "revoked_by", "revoked_at", "expires_at"
    ) values (
      v_target_role, v_target_user_id::text, v_target_email, 'active',
      v_reason, v_actor_user_id, timezone('utc'::text, now()),
      timezone('utc'::text, now()), null, null, null
    ) returning "id" into v_membership_id;
  else
    update public."platform_role_memberships"
    set "user_id" = v_target_user_id::text,
        "email" = v_target_email,
        "status" = 'active',
        "notes" = v_reason,
        "granted_by" = v_actor_user_id,
        "granted_at" = timezone('utc'::text, now()),
        "updated_at" = timezone('utc'::text, now()),
        "revoked_by" = null,
        "revoked_at" = null,
        "expires_at" = null
    where "id" = v_membership_id;
  end if;

  perform public."platform_staff_write_audit"(
    v_actor_user_id, v_actor_email, v_actor_role, v_target_email,
    'grant', v_target_role, v_reason,
    jsonb_build_object('target_user_id', v_target_user_id, 'exact_subject', true)
  );

  return jsonb_build_object(
    'id', v_membership_id,
    'userId', v_target_user_id,
    'email', v_target_email,
    'role', v_target_role,
    'displayRole', case when v_target_role = 'operator' then 'admin' else v_target_role end,
    'status', 'active'
  );
end;
$fixture$;

CREATE OR REPLACE FUNCTION "public"."admin_update_official_rachi_profile_image"(p_avatar_url text DEFAULT NULL::text, p_reason text DEFAULT 'Official Rachi profile photo update'::text)
RETURNS jsonb
LANGUAGE "plpgsql"
VOLATILE
SECURITY DEFINER
CALLED ON NULL INPUT
PARALLEL UNSAFE
COST 100
SET search_path TO 'public'
AS $fixture$
declare
  actor_role text;
  safe_avatar_url text := nullif(trim(coalesce(p_avatar_url, '')), '');
  safe_reason text := nullif(trim(coalesce(p_reason, '')), '');
  previous_profile public."user_profiles"%rowtype;
  updated_profile public."user_profiles"%rowtype;
  audit_id uuid;
begin
  actor_role := public."admin_content_assert_operator"();

  if safe_avatar_url is not null then
    if char_length(safe_avatar_url) > 2048 then
      raise exception 'rachi_profile_image_url_too_long';
    end if;

    if lower(safe_avatar_url) not like 'https://%' then
      raise exception 'rachi_profile_image_https_required';
    end if;
  end if;

  safe_reason := coalesce(safe_reason, 'Official Rachi profile photo update');

  select *
  into previous_profile
  from public."user_profiles"
  where "user_id" = 'platform_rachi_official';

  insert into public."user_profiles" (
    "user_id",
    "username",
    "avatar_index",
    "display_name",
    "avatar_url",
    "profile_avatar_media_status",
    "profile_avatar_fit_mode",
    "profile_avatar_focal_x",
    "profile_avatar_focal_y",
    "profile_visibility",
    "public_activity_visibility",
    "tagline",
    "channel_role",
    "profile_media_updated_at",
    "updated_at"
  )
  values (
    'platform_rachi_official',
    'chillywood.rachi',
    0,
    'Rachi',
    safe_avatar_url,
    'active',
    'fill',
    0.5,
    0.5,
    'everyone',
    'public',
    'Official Chi''llwood guide for updates, tips, and Chi''llwood Originals.',
    'creator',
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
  )
  on conflict ("user_id")
  do update set
    "username" = excluded."username",
    "display_name" = excluded."display_name",
    "avatar_url" = excluded."avatar_url",
    "profile_avatar_media_status" = 'active',
    "profile_avatar_fit_mode" = 'fill',
    "profile_avatar_focal_x" = 0.5,
    "profile_avatar_focal_y" = 0.5,
    "profile_visibility" = 'everyone',
    "public_activity_visibility" = 'public',
    "tagline" = excluded."tagline",
    "channel_role" = 'creator',
    "profile_media_updated_at" = excluded."profile_media_updated_at",
    "updated_at" = excluded."updated_at"
  returning * into updated_profile;

  audit_id := public."admin_content_write_audit"(
    'official_rachi_profile_image_updated',
    'user_profile',
    updated_profile."user_id",
    safe_reason,
    case when previous_profile."user_id" is null then null else to_jsonb(previous_profile) end,
    to_jsonb(updated_profile),
    jsonb_build_object(
      'official_account_id', 'platform_rachi_official',
      'rachi_official_account', true,
      'surface', 'admin_rachi_tab',
      'avatar_url_present', safe_avatar_url is not null
    ),
    'platform_rachi_official',
    'notice'
  );

  return jsonb_build_object(
    'userId', updated_profile."user_id",
    'avatarUrl', updated_profile."avatar_url",
    'updatedAt', updated_profile."updated_at",
    'auditId', audit_id,
    'actorRole', actor_role
  );
end;
$fixture$;

CREATE OR REPLACE FUNCTION "public"."grant_sandbox_monetization_tester"(p_email text DEFAULT NULL::text, p_user_id text DEFAULT NULL::text, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_note text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE "plpgsql"
VOLATILE
SECURITY DEFINER
CALLED ON NULL INPUT
PARALLEL UNSAFE
COST 100
SET search_path TO ''
AS $fixture$
declare
  v_email text:=nullif(lower(trim(coalesce(p_email,''))),'');
  v_user_id uuid;
  v_candidate_ids uuid[];
  v_note text:=nullif(trim(coalesce(p_note,'')),'');
  v_row public."sandbox_monetization_testers"%rowtype;
begin
  if not public."has_platform_role"(array['owner'::text,'operator'::text]) then
    raise exception 'owner_operator_required';
  end if;
  if nullif(trim(coalesce(p_user_id,'')),'') is not null then
    begin
      v_user_id:=trim(p_user_id)::uuid;
    exception when others then
      raise exception 'tester_exact_confirmed_subject_required';
    end;
    if not exists (
      select 1 from auth.users subject
      where subject."id"=v_user_id and subject."email_confirmed_at" is not null
        and (v_email is null or lower(trim(subject."email"))=v_email)
    ) then
      raise exception 'tester_exact_confirmed_subject_required';
    end if;
  else
    if v_email is null then raise exception 'tester_identity_required'; end if;
    select array_agg(subject."id" order by subject."id") into v_candidate_ids
    from auth.users subject
    where lower(trim(subject."email"))=v_email
      and subject."email_confirmed_at" is not null;
    if coalesce(cardinality(v_candidate_ids),0)<>1 then
      raise exception 'tester_exact_confirmed_subject_required';
    end if;
    v_user_id:=v_candidate_ids[1];
  end if;
  select lower(trim(subject."email")) into v_email
  from auth.users subject where subject."id"=v_user_id;
  if v_note is not null and v_note ~*
    '(secret|token|password|service_role|private_key|webhook_secret|api_key|authorization)'
  then
    raise exception 'unsafe_note';
  end if;
  if p_expires_at is not null and p_expires_at<=timezone('utc'::text,now()) then
    raise exception 'tester_expiry_must_be_future';
  end if;
  update public."sandbox_monetization_testers"
  set "status"='revoked',"revoked_at"=timezone('utc'::text,now()),
      "updated_at"=timezone('utc'::text,now())
  where "status"='active' and (
    "user_id"=v_user_id::text or lower(trim(coalesce("email",'')))=v_email
  );
  insert into public."sandbox_monetization_testers"(
    "user_id","email","status","note","expires_at","created_by"
  ) values (
    v_user_id::text,v_email,'active',v_note,p_expires_at,auth.uid()::text
  ) returning * into v_row;
  return jsonb_build_object(
    'id',v_row."id",'userId',v_row."user_id",'email',v_row."email",
    'status',v_row."status",'expiresAt',v_row."expires_at",
    'createdAt',v_row."created_at",'sandboxOnly',true,'notPayable',true,
    'ownerRoleGranted',false,'payoutAccessGranted',false
  );
end;
$fixture$;

CREATE OR REPLACE FUNCTION "public"."has_active_beta_access"()
RETURNS boolean
LANGUAGE "sql"
STABLE
SECURITY DEFINER
CALLED ON NULL INPUT
PARALLEL UNSAFE
COST 100
SET search_path TO ''
AS $fixture$
  select auth.uid() is not null
    and public."wave1_current_caller_authority_internal"()
    and exists (
      select 1 from public."beta_access_memberships" membership
      where membership."access_status"='active'
        and membership."user_id"=auth.uid()::text
    );
$fixture$;

CREATE OR REPLACE FUNCTION "public"."has_platform_permission"(p_permission_key text)
RETURNS boolean
LANGUAGE "sql"
STABLE
SECURITY DEFINER
CALLED ON NULL INPUT
PARALLEL UNSAFE
COST 100
SET search_path TO ''
AS $fixture$
  select auth.uid() is not null and (
    public."has_platform_role"(array['owner'::text])
    or (
      public."has_platform_role"(array['operator'::text,'moderator'::text])
      and exists (
        select 1 from public."platform_staff_permission_grants" grant_row
        where grant_row."status"='active'
          and grant_row."target_user_id"=auth.uid()::text
          and grant_row."permission_key"=any(
            public."platform_admin_scope_legacy_aliases"(p_permission_key)
          )
          and (grant_row."expires_at" is null
            or grant_row."expires_at">timezone('utc'::text,now()))
      )
    )
  );
$fixture$;

CREATE OR REPLACE FUNCTION "public"."has_platform_role"(required_roles text[])
RETURNS boolean
LANGUAGE "sql"
STABLE
SECURITY DEFINER
CALLED ON NULL INPUT
PARALLEL UNSAFE
COST 100
SET search_path TO ''
AS $fixture$
  select auth.uid() is not null
    and public."wave1_current_caller_authority_internal"()
    and coalesce(array_length(required_roles, 1), 0) > 0
    and exists (
      select 1 from auth.users subject
      where subject."id"=auth.uid() and subject."email_confirmed_at" is not null
    )
    and exists (
      select 1
      from public."platform_role_memberships" membership
      where membership."status" = 'active'
        and membership."role" = any(required_roles)
        and (membership."expires_at" is null or membership."expires_at" > timezone('utc'::text, now()))
        and membership."user_id" = auth.uid()::text
    )
$fixture$;

CREATE OR REPLACE FUNCTION "public"."is_platform_owner_user"(target_user_id text)
RETURNS boolean
LANGUAGE "sql"
STABLE
SECURITY DEFINER
CALLED ON NULL INPUT
PARALLEL UNSAFE
COST 100
SET search_path TO ''
AS $fixture$
  select nullif(trim(coalesce(target_user_id,'')),'') is not null
    and exists (
      select 1 from auth.users subject
      where subject."id"::text=nullif(trim(coalesce(target_user_id,'')),'')
        and subject."email_confirmed_at" is not null
    )
    and exists (
      select 1 from public."platform_role_memberships" membership
      where membership."status"='active' and membership."role"='owner'
        and membership."user_id"=nullif(trim(coalesce(target_user_id,'')),'')
        and (membership."expires_at" is null
          or membership."expires_at">timezone('utc'::text,now()))
    );
$fixture$;

CREATE OR REPLACE FUNCTION "public"."product_quality_detection_assessment_hash"(p_sentinel_run_id uuid, p_finding_key text, p_route_or_surface text, p_build_runtime_hash text, p_severity text, p_user_impact_hash text, p_evidence_hashes text[], p_suspected_layer text, p_confidence numeric, p_reproduction_state text, p_affected_components_hash text, p_provider_backend_state_hash text, p_proposed_next_investigation_hash text, p_physical_proof_status text)
RETURNS text
LANGUAGE "sql"
IMMUTABLE
SECURITY DEFINER
CALLED ON NULL INPUT
PARALLEL UNSAFE
COST 100
SET search_path TO ''
AS $fixture$
select encode(extensions.digest(convert_to(jsonb_build_object('affectedComponentsHash',p_affected_components_hash,'buildRuntimeHash',p_build_runtime_hash,'confidence',pg_catalog.trim_scale(p_confidence),'evidenceHashes',to_jsonb(p_evidence_hashes),'findingKey',p_finding_key,'physicalProofStatus',p_physical_proof_status,'proposedNextInvestigationHash',p_proposed_next_investigation_hash,'providerBackendStateHash',p_provider_backend_state_hash,'reproductionState',p_reproduction_state,'routeOrSurface',p_route_or_surface,'sentinelRunId',p_sentinel_run_id,'severity',p_severity,'suspectedLayer',p_suspected_layer,'userImpactHash',p_user_impact_hash)::text,'UTF8'),'sha256'),'hex');
$fixture$;

CREATE OR REPLACE FUNCTION "public"."product_quality_require_evaluator_for_collected_run"()
RETURNS trigger
LANGUAGE "plpgsql"
VOLATILE
SECURITY DEFINER
CALLED ON NULL INPUT
PARALLEL UNSAFE
COST 100
SET search_path TO ''
AS $fixture$
declare
  run_value public.product_experience_sentinel_runs%rowtype;
  proof_value public.product_experience_sentinel_evaluator_proofs%rowtype;
  expected_finding_key text;
  expected_scope_hash text;
  expected_assessment_hash text;
  proof_matches boolean := false;
begin
  select * into run_value from public.product_experience_sentinel_runs where id=new.sentinel_run_id;
  if run_value.id is null then raise exception 'product_quality_evaluator_proof_required' using errcode='42501'; end if;
  expected_finding_key := public.product_quality_expected_finding_key(run_value.task_id,run_value.project_id,run_value.platform,run_value.environment,new.route_or_surface,new.finding_class);
  expected_scope_hash := encode(extensions.digest(convert_to(expected_finding_key,'UTF8'),'sha256'),'hex');
  expected_assessment_hash := public.product_quality_detection_assessment_hash(run_value.id,expected_finding_key,new.route_or_surface,new.build_runtime_hash,new.severity,new.user_impact_hash,new.evidence_hashes,new.suspected_layer,new.confidence,new.reproduction_state,new.affected_components_hash,new.provider_backend_state_hash,new.proposed_next_investigation_hash,new.physical_proof_status);
  select * into proof_value from public.product_experience_sentinel_evaluator_proofs where id=new.current_evaluator_proof_id;
  proof_matches := run_value.collector_capability_id is not null
    and run_value.erased_at is null
    and run_value.evaluation_expires_at > transaction_timestamp()
    and run_value.result_status in ('failed','blocked')
    and new.task_id is not distinct from run_value.task_id
    and new.project_id is not distinct from run_value.project_id
    and new.platform is not distinct from run_value.platform
    and new.environment is not distinct from run_value.environment
    and new.route_or_surface is not distinct from run_value.route_or_surface
    and new.build_runtime_hash is not distinct from run_value.source_build_hash
    and new.physical_proof_status is not distinct from run_value.physical_proof_status
    and new.finding_key is not distinct from expected_finding_key
    and new.finding_scope_hash is not distinct from expected_scope_hash
    and new.occurrence_count=1
    and new.current_status='open'
    and new.resolved_at is null
    and new.resolution_hash is null
    and new.evidence_hashes is not null
    and public.governance_hash_array_valid(new.evidence_hashes,1,64)
    and run_value.evidence_manifest_hash=any(new.evidence_hashes)
    and proof_value.id is not null
    and proof_value.sentinel_run_id=run_value.id
    and proof_value.task_id=run_value.task_id
    and proof_value.project_id=run_value.project_id
    and proof_value.platform=run_value.platform
    and proof_value.environment=run_value.environment
    and proof_value.assessment_kind='finding_detection'
    and proof_value.assessment_hash=expected_assessment_hash
    and proof_value.evidence_manifest_hash=run_value.evidence_manifest_hash
    and proof_value.verdict='passed'
    and proof_value.evaluator_identity in ('cognitive_independent_evaluator','cognitive_product_quality_evaluator')
    and proof_value.valid_until > transaction_timestamp();
  if proof_matches is not true then raise exception 'product_quality_evaluator_proof_required' using errcode='42501'; end if;
  return new;
end;
$fixture$;

CREATE OR REPLACE FUNCTION "public"."resolve_sandbox_monetization_tester"(p_user_id text DEFAULT NULL::text, p_email text DEFAULT NULL::text)
RETURNS boolean
LANGUAGE "sql"
STABLE
SECURITY DEFINER
CALLED ON NULL INPUT
PARALLEL UNSAFE
COST 100
SET search_path TO ''
AS $fixture$
  select auth.uid() is not null
    and public."wave1_current_caller_authority_internal"()
    and (
      nullif(trim(coalesce(p_user_id,'')),'') is null
      or nullif(trim(coalesce(p_user_id,'')),'')=auth.uid()::text
    )
    and (
      nullif(lower(trim(coalesce(p_email,''))),'') is null
      or exists (
        select 1 from auth.users subject
        where subject."id"=auth.uid() and subject."email_confirmed_at" is not null
          and lower(trim(subject."email"))=lower(trim(p_email))
      )
    )
    and (
      public."has_platform_role"(array['owner'::text,'operator'::text])
      or public."has_active_beta_access"()
      or exists (
        select 1 from public."sandbox_monetization_testers" tester
        where tester."status"='active'
          and tester."user_id"=auth.uid()::text
          and (tester."expires_at" is null
            or tester."expires_at">timezone('utc'::text,now()))
      )
    );
$fixture$;

CREATE OR REPLACE FUNCTION "public"."resolve_watch_party_livekit_authority_pre_service_fix"(p_party_id text, p_user_id uuid, p_session_generation uuid)
RETURNS jsonb
LANGUAGE "plpgsql"
STABLE
SECURITY DEFINER
CALLED ON NULL INPUT
PARALLEL UNSAFE
COST 100
SET search_path TO ''
AS $fixture$
declare
  v_now timestamptz:=timezone('utc'::text,now());
  v_paid_required boolean := false;
  v_allowed boolean := false;
  v_is_host boolean := false;
  v_expires_at timestamptz;
begin
  if p_user_id is null or p_session_generation is null
    or nullif(trim(coalesce(p_party_id,'')),'') is null
    or public."is_account_access_restricted"(p_user_id::text)
    or not public."money_purchase_intent_session_authorized_internal"(
      p_user_id,p_session_generation::text
    )
  then
    return jsonb_build_object('allowed',false,'paidSeatRequired',false,'hostAuthority',false,'expiresAt',null,'reason','viewer_authority_invalid');
  end if;
  select exists (
    select 1 from public."paid_watch_party_offers" offer
    where offer."party_id"=p_party_id
      and offer."status" in ('sandbox','active','paused','sold_out','blocked')
  ) into v_paid_required;
  select exists (
    select 1 from public."watch_party_rooms" room
    where room."party_id"=p_party_id and room."host_user_id"=p_user_id
  ) into v_is_host;
  if v_is_host and v_paid_required and (
    public."revenuecat_authority_quarantined_internal"(null,p_user_id,null)
    or not public."wave1_creator_money_subject_authorized_internal"(p_user_id)
    or not exists (
      select 1 from public."paid_watch_party_offers" offer
      where offer."party_id"=p_party_id and offer."creator_id"=p_user_id
        and offer."status" in ('sandbox','active','sold_out')
        and (offer."starts_at" is null or offer."starts_at"<=v_now)
        and (offer."ends_at" is null or offer."ends_at">v_now)
    )
  ) then
    return jsonb_build_object(
      'allowed',false,'paidSeatRequired',true,'hostAuthority',true,
      'expiresAt',null,'reason','paid_room_host_creator_authority_required'
    );
  end if;
  v_allowed := public."watch_party_room_self_access_allowed_internal"(p_party_id,p_user_id::text);
  if not v_allowed then
    return jsonb_build_object(
      'allowed',false,'paidSeatRequired',v_paid_required,'hostAuthority',v_is_host,'expiresAt',null,
      'reason',case when v_paid_required then 'exact_paid_seat_authority_required' else 'room_viewer_authority_required' end
    );
  end if;
  if v_is_host then
    if v_paid_required then
      select least(coalesce(max(offer."ends_at"),v_now+interval '30 seconds'),v_now+interval '30 seconds')
      into v_expires_at
      from public."paid_watch_party_offers" offer
      where offer."party_id"=p_party_id
        and offer."creator_id"=p_user_id
        and offer."status" in ('sandbox','active','sold_out')
        and (offer."starts_at" is null or offer."starts_at"<=v_now)
        and (offer."ends_at" is null or offer."ends_at">v_now);
      return jsonb_build_object(
        'allowed',true,'paidSeatRequired',true,'hostAuthority',true,
        'expiresAt',v_expires_at,'reason','paid_room_host_authority'
      );
    end if;
    return jsonb_build_object(
      'allowed',true,'paidSeatRequired',false,'hostAuthority',true,
      'expiresAt',null,'reason','non_seat_room_host_authority'
    );
  end if;
  if not v_paid_required then
    return jsonb_build_object('allowed',true,'paidSeatRequired',false,'hostAuthority',false,'expiresAt',null,'reason','non_seat_room_authority');
  end if;

  select least(ticket."expires_at",grant_row."expires_at",offer."ends_at") into v_expires_at
  from public."access_grants" grant_row
  join public."paid_watch_party_offers" offer
    on offer."id"=grant_row."source_id" and offer."party_id"=p_party_id
   and offer."status" in ('sandbox','active','sold_out')
  join public."provider_events" provider_event
    on provider_event."id"=grant_row."provider_event_id"
   and provider_event."provider" in ('revenuecat_app_store','revenuecat_google_play')
   and provider_event."provider"=grant_row."provider" and provider_event."status"='processed'
   and provider_event."user_id"=p_user_id
   and not public."revenuecat_authority_quarantined_internal"(
     provider_event."provider",provider_event."user_id",provider_event."environment"
   )
  join public."money_purchase_intents" intent
    on intent."id"::text=grant_row."metadata"->>'purchase_intent_id'
   and intent."user_id"=p_user_id and intent."source_id"=offer."id"
   and intent."creator_id"=offer."creator_id" and intent."provider"=provider_event."provider"
   and intent."provider_product_id"=provider_event."metadata"->>'provider_product_id'
   and intent."status"='consumed'
  join public."revenuecat_consumable_transaction_intents" transaction_link
    on transaction_link."purchase_intent_id"=intent."id" and transaction_link."provider"=provider_event."provider"
   and transaction_link."original_transaction_id"=grant_row."metadata"->>'original_transaction_id'
   and transaction_link."binding_state"='exact' and not transaction_link."terminal"
  join public."paid_watch_party_tickets" ticket
    on ticket."access_grant_id"=grant_row."id" and ticket."offer_id"=offer."id"
   and ticket."party_id"=offer."party_id" and ticket."buyer_id"=p_user_id
   and ticket."status"='active' and ticket."refunded_at" is null and ticket."revoked_at" is null
   and (ticket."expires_at" is null or ticket."expires_at">timezone('utc'::text,now()))
  where grant_row."user_id"=p_user_id and grant_row."grant_type"='watch_party_live_ticket'
    and grant_row."source_type"='provider_event' and grant_row."status" in ('active','sandbox_only')
    and grant_row."starts_at"<=timezone('utc'::text,now())
    and (grant_row."expires_at" is null or grant_row."expires_at">timezone('utc'::text,now()))
    and grant_row."refunded_at" is null and grant_row."revoked_at" is null
    and (offer."ends_at" is null or offer."ends_at">timezone('utc'::text,now()))
    and coalesce((grant_row."metadata"->>'viewer_access_only')::boolean,false)
    and not coalesce((grant_row."metadata"->>'authority_granted')::boolean,false)
    and not coalesce((grant_row."metadata"->>'speaker_authority')::boolean,false)
    and not coalesce((grant_row."metadata"->>'moderator_authority')::boolean,false)
    and not coalesce((grant_row."metadata"->>'payout_access')::boolean,false)
    and not coalesce((grant_row."metadata"->>'premium_unlock')::boolean,false)
  order by grant_row."created_at" desc,grant_row."id" desc limit 1;
  v_expires_at:=least(coalesce(v_expires_at,v_now+interval '30 seconds'),v_now+interval '30 seconds');
  return jsonb_build_object(
    'allowed',true,'paidSeatRequired',true,'hostAuthority',false,'expiresAt',v_expires_at,
    'reason','exact_paid_seat_viewer_authority'
  );
end;
$fixture$;

CREATE OR REPLACE FUNCTION "public"."search_public_people"(p_query text, p_limit integer DEFAULT 12)
RETURNS TABLE(user_id text, display_name text, username text, avatar_url text, is_official boolean, official_label text, has_public_platform boolean, public_platform_id text, short_bio text)
LANGUAGE "sql"
STABLE
SECURITY DEFINER
CALLED ON NULL INPUT
PARALLEL UNSAFE
COST 100
ROWS 1000
SET search_path TO 'public'
AS $fixture$
  with input as (
    select
      nullif(regexp_replace(lower(btrim(coalesce(p_query, ''))), '^@+', ''), '') as query_text,
      least(25, greatest(1, coalesce(p_limit, 12))) as limit_count
  ),
  public_profile_candidates as (
    select
      profile."user_id",
      profile."username",
      profile."display_name",
      profile."avatar_url",
      profile."profile_avatar_media_status",
      profile."tagline",
      profile."channel_role",
      profile."updated_at",
      exists (
        select 1
        from public."platform_brand_profiles" brand
        where brand."owner_user_id" = profile."user_id"
          and brand."published_at" is not null
        limit 1
      ) as has_published_platform_brand,
      exists (
        select 1
        from public."videos" video
        where video."owner_id"::text = profile."user_id"
          and video."visibility" = 'public'
          and video."moderation_status" in ('clean', 'reported')
        limit 1
      ) as has_public_creator_video,
      exists (
        select 1
        from public."creator_events" event
        where event."host_user_id"::text = profile."user_id"
          and event."status" in ('scheduled', 'live_now', 'ended', 'replay_available')
        limit 1
      ) as has_public_creator_event
    from public."user_profiles" profile
    cross join input
    where input.query_text is not null
      and length(input.query_text) >= 2
      and input.query_text not like '%@%'
      and not public.is_account_deletion_scheduled(profile."user_id")
      and public.can_view_profile_content(profile."user_id")
      and (
        lower(coalesce(profile."username", '')) like '%' || input.query_text || '%'
        or lower(coalesce(profile."display_name", '')) like '%' || input.query_text || '%'
      )
      and (
        profile."user_id" = 'platform_rachi_official'
        or not exists (
          select 1
          from public."platform_role_memberships" membership
          where membership."status" = 'active'
            and membership."user_id" = profile."user_id"
            and lower(membership."role") in ('owner', 'operator', 'moderator', 'security', 'support', 'system')
          limit 1
        )
      )
      and (
        profile."user_id" = 'platform_rachi_official'
        or not public.public_people_search_is_internal_account_candidate(
          profile."user_id",
          profile."username",
          profile."display_name"
        )
      )
  ),
  explicit_official_candidates as (
    select
      'platform_rachi_official'::text as "user_id",
      'chillywood.rachi'::text as "username",
      'Rachi'::text as "display_name",
      null::text as "avatar_url",
      'active'::text as "profile_avatar_media_status",
      'Official Chi''llwood guide for updates, tips, and Chi''llwood Originals.'::text as "tagline",
      'creator'::text as "channel_role",
      now() as "updated_at",
      true as has_published_platform_brand,
      true as has_public_creator_video,
      false as has_public_creator_event
    from input
    where input.query_text is not null
      and length(input.query_text) >= 2
      and input.query_text not like '%@%'
      and (
        'rachi' like '%' || input.query_text || '%'
        or 'chillywood.rachi' like '%' || input.query_text || '%'
        or 'official chillywood' like '%' || input.query_text || '%'
      )
      and not exists (
        select 1
        from public_profile_candidates profile_candidate
        where profile_candidate."user_id" = 'platform_rachi_official'
      )
  ),
  public_candidates as (
    select
      "user_id",
      "username",
      "display_name",
      "avatar_url",
      "profile_avatar_media_status",
      "tagline",
      "channel_role",
      "updated_at",
      has_published_platform_brand,
      has_public_creator_video,
      has_public_creator_event
    from public_profile_candidates
    union all
    select
      "user_id",
      "username",
      "display_name",
      "avatar_url",
      "profile_avatar_media_status",
      "tagline",
      "channel_role",
      "updated_at",
      has_published_platform_brand,
      has_public_creator_video,
      has_public_creator_event
    from explicit_official_candidates
  )
  select
    candidate."user_id",
    coalesce(nullif(candidate."display_name", ''), nullif(candidate."username", ''), 'Member') as display_name,
    coalesce(nullif(candidate."username", ''), '') as username,
    case
      when coalesce(candidate."profile_avatar_media_status", 'active') = 'active'
        then candidate."avatar_url"
      else null::text
    end as avatar_url,
    candidate."user_id" = 'platform_rachi_official' as is_official,
    case
      when candidate."user_id" = 'platform_rachi_official' then 'Official Chi''llwood'
      else null::text
    end as official_label,
    (
      candidate."user_id" = 'platform_rachi_official'
      or lower(coalesce(candidate."channel_role", '')) in ('creator', 'host')
      or candidate.has_published_platform_brand
      or candidate.has_public_creator_video
      or candidate.has_public_creator_event
    ) as has_public_platform,
    case
      when (
        candidate."user_id" = 'platform_rachi_official'
        or lower(coalesce(candidate."channel_role", '')) in ('creator', 'host')
        or candidate.has_published_platform_brand
        or candidate.has_public_creator_video
        or candidate.has_public_creator_event
      ) then candidate."user_id"
      else null::text
    end as public_platform_id,
    nullif(candidate."tagline", '') as short_bio
  from public_candidates candidate
  cross join input
  order by
    case
      when lower(coalesce(candidate."username", '')) = input.query_text then 0
      when lower(coalesce(candidate."display_name", '')) = input.query_text then 1
      when lower(coalesce(candidate."username", '')) like input.query_text || '%' then 2
      when lower(coalesce(candidate."display_name", '')) like input.query_text || '%' then 3
      else 4
    end,
    case when candidate."user_id" = 'platform_rachi_official' then 0 else 1 end,
    case
      when (
        lower(coalesce(candidate."channel_role", '')) in ('creator', 'host')
        or candidate.has_published_platform_brand
        or candidate.has_public_creator_video
        or candidate.has_public_creator_event
      ) then 0
      else 1
    end,
    candidate."updated_at" desc
  limit (select limit_count from input);
$fixture$;

CREATE OR REPLACE FUNCTION "public"."sync_paid_creator_event_pass_from_access_grant"()
RETURNS trigger
LANGUAGE "plpgsql"
VOLATILE
SECURITY DEFINER
CALLED ON NULL INPUT
PARALLEL UNSAFE
COST 100
SET search_path TO ''
AS $fixture$
declare
  v_offer public."paid_creator_events"%rowtype;
  v_provider public."provider_events"%rowtype;
  v_ledger public."money_access_ledger_events"%rowtype;
  v_transaction public."creator_event_transactions"%rowtype;
  v_pass public."paid_creator_event_passes"%rowtype;
  v_active boolean;
begin
  if new."grant_type" <> 'event_pass' or new."source_id" is null then
    return new;
  end if;

  select * into v_offer
  from public."paid_creator_events"
  where "creator_event_id" = new."source_id"
  limit 1;

  if v_offer."id" is null then
    return new;
  end if;

  select * into v_provider
  from public."provider_events"
  where "id" = new."provider_event_id"
  limit 1;

  select * into v_ledger
  from public."money_access_ledger_events"
  where "provider_event_id" = new."provider_event_id"
  limit 1;

  v_active := new."status" in ('active', 'sandbox_only')
    and new."refunded_at" is null
    and new."revoked_at" is null
    and new."starts_at" <= timezone('utc'::text, now())
    and (new."expires_at" is null or new."expires_at" > timezone('utc'::text, now()));

  insert into public."creator_event_transactions" (
    "event_id",
    "creator_event_id",
    "creator_id",
    "buyer_id",
    "amount_cents",
    "currency",
    "provider",
    "provider_product_id",
    "provider_transaction_id",
    "provider_event_id",
    "ledger_event_id",
    "status",
    "payout_status",
    "paid_at",
    "refunded_at",
    "metadata"
  )
  values (
    v_offer."id",
    v_offer."creator_event_id",
    v_offer."creator_id",
    new."user_id",
    coalesce(v_ledger."amount_minor", v_offer."price_cents"),
    coalesce(v_ledger."currency", v_offer."currency"),
    coalesce(new."provider", 'revenuecat_google_play'),
    coalesce(v_provider."metadata"->>'provider_product_id', v_offer."provider_product_id"),
    v_provider."provider_event_id",
    new."provider_event_id",
    v_ledger."id",
    case when v_active then 'paid' when new."status" = 'refunded' then 'refunded' when new."status" = 'revoked' then 'revoked' else 'pending' end,
    coalesce(v_ledger."payable_state", 'not_payable'),
    case when v_active then timezone('utc'::text, now()) else null end,
    new."refunded_at",
    jsonb_build_object(
      'sandbox_only', new."environment" = 'sandbox',
      'premium_unlock', false,
      'tips_path', false,
      'paid_video_unlock', false,
      'paid_watch_party_ticket_unlock', false,
      'vip_unlock', false,
      'subscription_unlock', false,
      'room_media_controls', false,
      'grants_host_authority', false
    )
  )
  on conflict ("provider_event_id")
  where "provider_event_id" is not null
  do update set
    "status" = excluded."status",
    "payout_status" = excluded."payout_status",
    "refunded_at" = excluded."refunded_at",
    "metadata" = excluded."metadata"
  returning * into v_transaction;

  if v_active then
    if v_offer."capacity_limit" is not null
      and not exists (
        select 1
        from public."paid_creator_event_passes" existing_pass
        where existing_pass."event_id" = v_offer."id"
          and existing_pass."buyer_id" = new."user_id"
          and existing_pass."status" = 'active'
      )
      and (
        select count(*)::integer
        from public."paid_creator_event_passes" event_pass
        where event_pass."event_id" = v_offer."id"
          and event_pass."status" = 'active'
          and event_pass."refunded_at" is null
          and event_pass."revoked_at" is null
          and (event_pass."expires_at" is null or event_pass."expires_at" > timezone('utc'::text, now()))
      ) >= v_offer."capacity_limit"
    then
      update public."creator_event_transactions"
      set
        "status" = 'canceled',
        "metadata" = "metadata" || jsonb_build_object('blocked_reason', 'sold_out', 'access_granted', false)
      where "id" = v_transaction."id";

      update public."paid_creator_events"
      set
        "status" = 'sold_out',
        "updated_at" = timezone('utc'::text, now())
      where "id" = v_offer."id";

      insert into public."paid_event_events" ("event_id", "transaction_id", "actor_id", "event_type", "metadata")
      values (
        v_offer."id",
        v_transaction."id",
        new."user_id",
        'pass_blocked_sold_out',
        jsonb_build_object('provider_event_id', new."provider_event_id", 'sandbox_only', new."environment" = 'sandbox')
      );

      return new;
    end if;

    insert into public."paid_creator_event_passes" (
      "event_id",
      "creator_event_id",
      "buyer_id",
      "creator_id",
      "source_transaction_id",
      "access_grant_id",
      "provider",
      "provider_transaction_id",
      "status",
      "expires_at",
      "metadata"
    )
    values (
      v_offer."id",
      v_offer."creator_event_id",
      new."user_id",
      v_offer."creator_id",
      v_transaction."id",
      new."id",
      coalesce(new."provider", 'revenuecat_google_play'),
      v_provider."provider_event_id",
      'active',
      new."expires_at",
      jsonb_build_object(
        'sandbox_only', new."environment" = 'sandbox',
        'viewer_access_only', true,
        'room_media_controls', false,
        'grants_host_authority', false
      )
    )
    on conflict ("event_id", "buyer_id")
    where "status" = 'active'
    do update set
      "access_grant_id" = excluded."access_grant_id",
      "source_transaction_id" = excluded."source_transaction_id",
      "provider_transaction_id" = excluded."provider_transaction_id",
      "expires_at" = excluded."expires_at"
    returning * into v_pass;

    update public."paid_creator_events" offer
    set
      "passes_sold" = (
        select count(*)::integer
        from public."paid_creator_event_passes" event_pass
        where event_pass."event_id" = offer."id"
          and event_pass."status" = 'active'
          and event_pass."refunded_at" is null
          and event_pass."revoked_at" is null
          and (event_pass."expires_at" is null or event_pass."expires_at" > timezone('utc'::text, now()))
      ),
      "status" = case
        when offer."capacity_limit" is not null
          and (
            select count(*)::integer
            from public."paid_creator_event_passes" event_pass
            where event_pass."event_id" = offer."id"
              and event_pass."status" = 'active'
              and event_pass."refunded_at" is null
              and event_pass."revoked_at" is null
          ) >= offer."capacity_limit"
        then 'sold_out'
        else offer."status"
      end,
      "updated_at" = timezone('utc'::text, now())
    where offer."id" = v_offer."id";
  else
    update public."paid_creator_event_passes"
    set
      "status" = case when new."status" = 'refunded' then 'refunded' when new."status" = 'revoked' then 'revoked' else 'expired' end,
      "refunded_at" = new."refunded_at",
      "revoked_at" = coalesce(new."revoked_at", timezone('utc'::text, now()))
    where "access_grant_id" = new."id"
      and "status" = 'active';
  end if;

  insert into public."paid_event_events" ("event_id", "pass_id", "transaction_id", "actor_id", "event_type", "metadata")
  values (
    v_offer."id",
    v_pass."id",
    v_transaction."id",
    new."user_id",
    case when v_active then 'event_pass_verified' else 'event_pass_revoked' end,
    jsonb_build_object('provider_event_id', new."provider_event_id", 'sandbox_only', new."environment" = 'sandbox')
  );

  return new;
end;
$fixture$;

CREATE OR REPLACE FUNCTION "public"."sync_paid_watch_party_ticket_from_access_grant"()
RETURNS trigger
LANGUAGE "plpgsql"
VOLATILE
SECURITY DEFINER
CALLED ON NULL INPUT
PARALLEL UNSAFE
COST 100
SET search_path TO ''
AS $fixture$
declare
  v_offer public."paid_watch_party_offers"%rowtype;
  v_provider public."provider_events"%rowtype;
  v_ledger public."money_access_ledger_events"%rowtype;
  v_transaction public."creator_room_ticket_transactions"%rowtype;
  v_ticket public."paid_watch_party_tickets"%rowtype;
  v_active boolean;
begin
  if new."grant_type" <> 'watch_party_live_ticket' or new."source_id" is null then
    return new;
  end if;

  select * into v_offer
  from public."paid_watch_party_offers"
  where "id" = new."source_id"
  limit 1;

  if v_offer."id" is null then
    return new;
  end if;

  select * into v_provider
  from public."provider_events"
  where "id" = new."provider_event_id"
  limit 1;

  select * into v_ledger
  from public."money_access_ledger_events"
  where "provider_event_id" = new."provider_event_id"
  limit 1;

  v_active := new."status" in ('active', 'sandbox_only')
    and new."refunded_at" is null
    and new."revoked_at" is null
    and new."starts_at" <= timezone('utc'::text, now())
    and (new."expires_at" is null or new."expires_at" > timezone('utc'::text, now()));

  insert into public."creator_room_ticket_transactions" (
    "offer_id",
    "party_id",
    "creator_id",
    "host_id",
    "buyer_id",
    "amount_cents",
    "currency",
    "provider",
    "provider_product_id",
    "provider_transaction_id",
    "provider_event_id",
    "ledger_event_id",
    "status",
    "payout_status",
    "paid_at",
    "refunded_at",
    "metadata"
  )
  values (
    v_offer."id",
    v_offer."party_id",
    v_offer."creator_id",
    v_offer."host_id",
    new."user_id",
    coalesce(v_ledger."amount_minor", v_offer."price_cents"),
    coalesce(v_ledger."currency", v_offer."currency"),
    coalesce(new."provider", 'revenuecat_google_play'),
    coalesce(v_provider."metadata"->>'provider_product_id', v_offer."provider_product_id"),
    v_provider."provider_event_id",
    new."provider_event_id",
    v_ledger."id",
    case when v_active then 'paid' when new."status" = 'refunded' then 'refunded' when new."status" = 'revoked' then 'revoked' else 'pending' end,
    coalesce(v_ledger."payable_state", 'not_payable'),
    case when v_active then timezone('utc'::text, now()) else null end,
    new."refunded_at",
    jsonb_build_object(
      'sandbox_only', new."environment" = 'sandbox',
      'premium_unlock', false,
      'tips_path', false,
      'paid_video_unlock', false,
      'live_stage_access', false
    )
  )
  on conflict ("provider_event_id")
  where "provider_event_id" is not null
  do update set
    "status" = excluded."status",
    "payout_status" = excluded."payout_status",
    "refunded_at" = excluded."refunded_at",
    "metadata" = excluded."metadata"
  returning * into v_transaction;

  if v_active then
    insert into public."paid_watch_party_tickets" (
      "offer_id",
      "party_id",
      "buyer_id",
      "creator_id",
      "host_id",
      "source_transaction_id",
      "access_grant_id",
      "provider",
      "provider_transaction_id",
      "status",
      "expires_at",
      "metadata"
    )
    values (
      v_offer."id",
      v_offer."party_id",
      new."user_id",
      v_offer."creator_id",
      v_offer."host_id",
      v_transaction."id",
      new."id",
      coalesce(new."provider", 'revenuecat_google_play'),
      v_provider."provider_event_id",
      'active',
      new."expires_at",
      jsonb_build_object(
        'sandbox_only', new."environment" = 'sandbox',
        'viewer_access_only', true
      )
    )
    on conflict ("offer_id", "buyer_id")
    where "status" = 'active'
    do update set
      "access_grant_id" = excluded."access_grant_id",
      "source_transaction_id" = excluded."source_transaction_id",
      "provider_transaction_id" = excluded."provider_transaction_id",
      "expires_at" = excluded."expires_at"
    returning * into v_ticket;

    update public."paid_watch_party_offers" offer
    set
      "seats_sold" = (
        select count(*)::integer
        from public."paid_watch_party_tickets" ticket
        where ticket."offer_id" = offer."id"
          and ticket."status" = 'active'
          and ticket."refunded_at" is null
          and ticket."revoked_at" is null
          and (ticket."expires_at" is null or ticket."expires_at" > timezone('utc'::text, now()))
      ),
      "status" = case
        when offer."seat_limit" is not null
          and (
            select count(*)::integer
            from public."paid_watch_party_tickets" ticket
            where ticket."offer_id" = offer."id"
              and ticket."status" = 'active'
              and ticket."refunded_at" is null
              and ticket."revoked_at" is null
          ) >= offer."seat_limit"
        then 'sold_out'
        else offer."status"
      end,
      "updated_at" = timezone('utc'::text, now())
    where offer."id" = v_offer."id";
  else
    update public."paid_watch_party_tickets"
    set
      "status" = case when new."status" = 'refunded' then 'refunded' when new."status" = 'revoked' then 'revoked' else 'expired' end,
      "refunded_at" = new."refunded_at",
      "revoked_at" = coalesce(new."revoked_at", timezone('utc'::text, now()))
    where "access_grant_id" = new."id"
      and "status" = 'active';
  end if;

  insert into public."room_ticket_events" ("offer_id", "ticket_id", "transaction_id", "actor_id", "event_type", "metadata")
  values (
    v_offer."id",
    v_ticket."id",
    v_transaction."id",
    new."user_id",
    case when v_active then 'ticket_verified' else 'ticket_revoked' end,
    jsonb_build_object('provider_event_id', new."provider_event_id", 'sandbox_only', new."environment" = 'sandbox')
  );

  return new;
end;
$fixture$;

CREATE OR REPLACE FUNCTION "public"."watch_party_room_access_pre_live_decouple"(p_party_id text, p_user_id text)
RETURNS boolean
LANGUAGE "plpgsql"
STABLE
SECURITY DEFINER
CALLED ON NULL INPUT
PARALLEL UNSAFE
COST 100
SET search_path TO ''
AS $fixture$
declare
  v_auth_user text := auth.uid()::text;
  v_request_role text := auth.role();
  v_room public."watch_party_rooms"%rowtype;
  v_paid_ticket_required boolean := false;
begin
  if nullif(trim(coalesce(p_party_id, '')), '') is null
    or nullif(trim(coalesce(p_user_id, '')), '') is null
  then
    return false;
  end if;
  select room.* into v_room
  from public."watch_party_rooms" room
  where room."party_id" = p_party_id;
  if v_room."party_id" is null then return false; end if;
  if v_request_role is distinct from 'service_role'
    and (
      v_auth_user is null
      or not public."wave1_current_caller_authority_internal"()
      or (v_auth_user<>p_user_id and v_auth_user<>v_room."host_user_id"::text)
    )
  then
    return false;
  end if;
  if coalesce(v_room."is_active",false) is not true then return false; end if;
  select exists (
    select 1
    from public."paid_watch_party_offers" offer
    where offer."party_id" = p_party_id
      and offer."status" in ('sandbox','active','paused','sold_out','blocked')
  ) into v_paid_ticket_required;
  if v_room."host_user_id"::text = p_user_id then
    if not v_paid_ticket_required then return true; end if;
    return not public."revenuecat_authority_quarantined_internal"(
        null,v_room."host_user_id",null
      )
      and public."wave1_creator_money_subject_authorized_internal"(v_room."host_user_id")
      and exists (
        select 1 from public."paid_watch_party_offers" offer
        where offer."party_id"=p_party_id
          and offer."creator_id"=v_room."host_user_id"
          and offer."status" in ('sandbox','active','sold_out')
          and (offer."starts_at" is null or offer."starts_at"<=timezone('utc'::text,now()))
          and (offer."ends_at" is null or offer."ends_at">timezone('utc'::text,now()))
      );
  end if;
  if v_room."join_policy" <> 'open'
    or coalesce(v_room."is_active", false) is not true
    or public."watch_party_room_actor_blocked_by_host"(p_party_id, p_user_id)
  then
    return false;
  end if;

  if not v_paid_ticket_required and v_room."content_access_rule" = 'open' then return true; end if;
  if not v_paid_ticket_required and v_room."content_access_rule" = 'party_pass' and exists (
    select 1 from public."user_entitlements" entitlement
    where entitlement."user_id" = p_user_id
      and entitlement."entitlement_key"='premium'
      and entitlement."status" in ('active','trialing','grace_period')
      and entitlement."revoked_at" is null
      and public."premium_subject_has_finite_authority_internal"(p_user_id)
  ) then return true; end if;
  if not v_paid_ticket_required and v_room."content_access_rule" = 'premium' and exists (
    select 1 from public."user_entitlements" entitlement
    where entitlement."user_id" = p_user_id
      and entitlement."entitlement_key" = any(case
        when v_room."room_type" = 'live' then array['premium'::text]
        when v_room."room_type" = 'title' then array['premium'::text]
        else array['premium'::text] end)
      and entitlement."status" in ('active','trialing','grace_period')
      and entitlement."revoked_at" is null
      and entitlement."entitlement_key"='premium'
      and public."premium_subject_has_finite_authority_internal"(p_user_id)
  ) then return true; end if;

  return exists (
    select 1
    from public."access_grants" grant_row
    join public."paid_watch_party_offers" offer
      on offer."id" = grant_row."source_id"
     and offer."party_id" = p_party_id
    join public."provider_events" provider_event
      on provider_event."id" = grant_row."provider_event_id"
     and provider_event."provider" in ('revenuecat_app_store','revenuecat_google_play')
     and provider_event."provider" = grant_row."provider"
     and provider_event."status" = 'processed'
     and provider_event."user_id"::text = p_user_id
     and not public."revenuecat_authority_quarantined_internal"(
       provider_event."provider",provider_event."user_id",provider_event."environment"
     )
    join public."money_purchase_intents" intent
      on intent."id"::text = grant_row."metadata"->>'purchase_intent_id'
     and intent."user_id"::text = p_user_id
     and intent."source_id" = offer."id"
     and intent."creator_id" = offer."creator_id"
     and intent."provider" = provider_event."provider"
     and intent."provider_product_id" = provider_event."metadata"->>'provider_product_id'
     and intent."status" = 'consumed'
    join public."revenuecat_consumable_transaction_intents" transaction_link
      on transaction_link."purchase_intent_id" = intent."id"
     and transaction_link."provider" = provider_event."provider"
     and transaction_link."original_transaction_id" = grant_row."metadata"->>'original_transaction_id'
     and transaction_link."binding_state" = 'exact'
     and not transaction_link."terminal"
    join public."paid_watch_party_tickets" ticket
      on ticket."access_grant_id"=grant_row."id"
     and ticket."offer_id"=offer."id"
     and ticket."party_id"=offer."party_id"
     and ticket."buyer_id"=grant_row."user_id"
     and ticket."status"='active'
     and ticket."refunded_at" is null
     and ticket."revoked_at" is null
     and (ticket."expires_at" is null or ticket."expires_at">timezone('utc'::text,now()))
    where grant_row."user_id"::text = p_user_id
      and grant_row."grant_type" = 'watch_party_live_ticket'
      and grant_row."source_type" = 'provider_event'
      and grant_row."status" in ('active','sandbox_only')
      and grant_row."starts_at" <= timezone('utc'::text, now())
      and (grant_row."expires_at" is null or grant_row."expires_at" > timezone('utc'::text, now()))
      and grant_row."refunded_at" is null
      and grant_row."revoked_at" is null
      and offer."status" in ('sandbox','active','sold_out')
      and (offer."starts_at" is null or offer."starts_at" <= timezone('utc'::text, now()))
      and (offer."ends_at" is null or offer."ends_at" > timezone('utc'::text, now()))
      and coalesce((grant_row."metadata"->>'viewer_access_only')::boolean, false)
      and not coalesce((grant_row."metadata"->>'authority_granted')::boolean, false)
      and not coalesce((grant_row."metadata"->>'speaker_authority')::boolean, false)
      and not coalesce((grant_row."metadata"->>'moderator_authority')::boolean, false)
      and not coalesce((grant_row."metadata"->>'payout_access')::boolean, false)
      and not coalesce((grant_row."metadata"->>'premium_unlock')::boolean, false)
      and public."wave1_creator_money_subject_authorized_internal"(offer."creator_id")
  );
end;
$fixture$;

DROP POLICY IF EXISTS "platform_role_memberships_select_own" ON "public"."platform_role_memberships";

CREATE POLICY "platform_role_memberships_select_own" ON "public"."platform_role_memberships" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((auth.uid() IS NOT NULL) AND (user_id = (auth.uid())::text)));

DROP POLICY IF EXISTS "platform_staff_permission_grants_select_owner_or_self" ON "public"."platform_staff_permission_grants";

CREATE POLICY "platform_staff_permission_grants_select_owner_or_self" ON "public"."platform_staff_permission_grants" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((has_platform_role(ARRAY['owner'::text]) OR ((auth.uid() IS NOT NULL) AND (target_user_id = (auth.uid())::text))));

DROP POLICY IF EXISTS "watch_party_room_memberships_self_insert_policy" ON "public"."watch_party_room_memberships";

CREATE POLICY "watch_party_room_memberships_self_insert_policy" ON "public"."watch_party_room_memberships" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((auth.uid() IS NOT NULL) AND (user_id = (auth.uid())::text) AND (EXISTS ( SELECT 1
   FROM watch_party_rooms room
  WHERE ((room.party_id = watch_party_room_memberships.party_id) AND ((room.host_user_id = auth.uid()) OR ((watch_party_room_memberships.role = 'viewer'::text) AND (watch_party_room_memberships.stage_role = 'listener'::text) AND (NOT watch_party_room_memberships.can_speak) AND (NOT watch_party_room_memberships.camera_enabled) AND (NOT watch_party_room_memberships.mic_enabled) AND watch_party_room_current_user_access_allowed(watch_party_room_memberships.party_id))))))));

DROP POLICY IF EXISTS "watch_party_room_memberships_self_update_policy" ON "public"."watch_party_room_memberships";

CREATE POLICY "watch_party_room_memberships_self_update_policy" ON "public"."watch_party_room_memberships" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((auth.uid() IS NOT NULL) AND (user_id = (auth.uid())::text))) WITH CHECK (((auth.uid() IS NOT NULL) AND (user_id = (auth.uid())::text) AND (EXISTS ( SELECT 1
   FROM watch_party_rooms room
  WHERE ((room.party_id = watch_party_room_memberships.party_id) AND ((room.host_user_id = auth.uid()) OR ((watch_party_room_memberships.role = 'viewer'::text) AND (watch_party_room_memberships.stage_role = 'listener'::text) AND (NOT watch_party_room_memberships.can_speak) AND (NOT watch_party_room_memberships.camera_enabled) AND (NOT watch_party_room_memberships.mic_enabled) AND ((watch_party_room_memberships.membership_state = ANY (ARRAY['left'::text, 'removed'::text])) OR watch_party_room_current_user_access_allowed(watch_party_room_memberships.party_id)))))))));

REVOKE EXECUTE ON FUNCTION public.has_active_beta_access() FROM service_role;

REVOKE EXECUTE ON FUNCTION public.resolve_sandbox_monetization_tester(text,text) FROM service_role;

REVOKE ALL ON public.user_profiles,public.creator_permissions FROM anon;

ALTER TABLE "public"."chat_messages" REPLICA IDENTITY FULL;

ALTER TABLE "public"."chat_thread_members" REPLICA IDENTITY FULL;

ALTER TABLE "public"."chat_threads" REPLICA IDENTITY FULL;

ALTER TABLE "public"."communication_room_memberships" REPLICA IDENTITY FULL;

ALTER TABLE "public"."user_content_relationships" REPLICA IDENTITY FULL;

ALTER TABLE "public"."user_profiles" REPLICA IDENTITY FULL;

ALTER TABLE "public"."watch_party_room_memberships" REPLICA IDENTITY FULL;

ALTER TABLE "public"."watch_party_room_messages" REPLICA IDENTITY FULL;
