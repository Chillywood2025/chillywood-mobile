-- Forward-only runtime authority reconciliation. Apply independently of the held
-- Studio migration only through its separately reviewed deployment workflow.
-- No historical migration or history rows are changed.
--
-- Cumulative contracts, not a blind canonical-body copy:
-- * exact live subject/session AND deployed account-legal authority for staff,
--   beta and sandbox reads; preserve optional tester-argument subject binding;
-- * strict three-argument staff grant and strict inaccessible predecessors;
--   preserve four-argument idempotency/receipt semantics with fresh-session guards;
-- * retain paid quarantine, exact nonterminal provider links, creator authority,
--   target Premium and purchase-session legal checks, adding exact proof joins;
-- * reject removed/restricted viewer or host before any wrapper fast allow;
-- * reject noncanonical room IDs before older service-target normalization.
-- CREATE OR REPLACE retains existing ownership and ACL. Only the two explicit
-- service EXECUTE repairs below change function permissions.
begin;

CREATE OR REPLACE FUNCTION public.has_platform_role(required_roles text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public."platform_exact_current_session_authority_internal"()
    and public."wave1_current_caller_authority_internal"()
    and public."platform_subject_has_role_internal"(auth.uid()::text, required_roles);
$function$;

CREATE OR REPLACE FUNCTION public.has_platform_permission(p_permission_key text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor_user_id text := auth.uid()::text;
  v_permission_key text := public."platform_staff_normalize_permission_key"(p_permission_key);
  v_aliases text[] := public."platform_admin_scope_legacy_aliases"(p_permission_key);
begin
  if not public."platform_exact_current_session_authority_internal"()
    or not public."wave1_current_caller_authority_internal"()
    or v_permission_key is null
  then
    return false;
  end if;

  if public."platform_subject_has_role_internal"(
    v_actor_user_id, array['owner'::text]
  ) then
    return true;
  end if;

  return public."platform_subject_has_role_internal"(
      v_actor_user_id, array['operator'::text, 'moderator'::text]
    )
    and exists (
      select 1
      from public."platform_staff_permission_grants" grant_row
      where grant_row."status" = 'active'
        and grant_row."target_user_id" = v_actor_user_id
        and grant_row."permission_key" = any(v_aliases)
        and (grant_row."expires_at" is null
          or grant_row."expires_at" > timezone('utc'::text, now()))
    );
end;
$function$;

CREATE OR REPLACE FUNCTION public.is_platform_owner_user(target_user_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public."platform_subject_has_role_internal"(
    nullif(trim(coalesce(target_user_id, '')), ''),
    array['owner'::text]
  );
$function$;

CREATE OR REPLACE FUNCTION public.has_active_beta_access()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public."platform_exact_current_session_authority_internal"()
    and public."wave1_current_caller_authority_internal"()
    and exists (
      select 1
      from public."beta_access_memberships" membership
      where membership."access_status" = 'active'
        and membership."user_id" = auth.uid()::text
    );
$function$;

CREATE OR REPLACE FUNCTION public.resolve_sandbox_monetization_tester(p_user_id text DEFAULT NULL::text, p_email text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public."platform_exact_current_session_authority_internal"()
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
$function$;

CREATE OR REPLACE FUNCTION public.grant_sandbox_monetization_tester(p_email text DEFAULT NULL::text, p_user_id text DEFAULT NULL::text, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor text := auth.uid()::text;
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_requested_user_id text := nullif(trim(coalesce(p_user_id, '')), '');
  v_target_user_id uuid;
  v_subject_email text;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_row public."sandbox_monetization_testers"%rowtype;
begin
  -- now() is fixed at transaction start; a queued mutation must use the
  -- wall clock and fresh session/role readback before it can commit authority.
  if not public."platform_exact_current_session_authority_internal"()
    or not public."wave1_current_caller_authority_internal"()
    or not exists (
      select 1 from auth.sessions session
      where session.user_id=auth.uid()
        and session.id::text=nullif(btrim(auth.jwt()->>'session_id'),'')
        and (session.not_after is null or session.not_after>clock_timestamp())
    )
    or not exists (
      select 1 from public."platform_role_memberships" membership
      where membership."user_id"=auth.uid()::text
        and membership."role" in ('owner','operator')
        and membership."status"='active'
        and (membership."expires_at" is null or membership."expires_at">clock_timestamp())
    )
  then raise exception 'platform_staff_auth_required'; end if;
  if not public."has_platform_role"(array['owner'::text, 'operator'::text]) then
    raise exception 'owner_operator_required';
  end if;
  if v_requested_user_id is null and v_email is null then
    raise exception 'tester_identity_required';
  end if;
  if p_expires_at is not null and p_expires_at <= timezone('utc'::text, now()) then
    raise exception 'tester_expiry_invalid';
  end if;
  if v_note is not null and v_note ~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|authorization)' then
    raise exception 'unsafe_note';
  end if;

  if v_requested_user_id is not null then
    begin
      v_target_user_id := v_requested_user_id::uuid;
    exception when others then
      raise exception 'platform_exact_confirmed_subject_required';
    end;
    select lower(trim(subject.email)) into v_subject_email
    from auth.users subject
    where subject.id = v_target_user_id
      and subject.email_confirmed_at is not null
      and subject.deleted_at is null;
    if not found then raise exception 'platform_exact_confirmed_subject_required'; end if;
    if v_email is not null and v_email is distinct from v_subject_email then
      raise exception 'sandbox_tester_subject_conflict';
    end if;
    v_email := coalesce(v_email, v_subject_email);
  else
    v_target_user_id := public."platform_resolve_exact_confirmed_subject_by_email_internal"(
      v_email
    );
    select lower(trim(subject.email)) into v_subject_email
    from auth.users subject where subject.id = v_target_user_id;
    v_email := v_subject_email;
  end if;

  if public."is_account_access_restricted"(v_target_user_id::text) then
    raise exception 'target_not_active';
  end if;
  if exists (
    select 1 from public."sandbox_monetization_testers" tester
    where tester."status" = 'active'
      and tester."email" = v_email
      and tester."user_id" is distinct from v_target_user_id::text
  ) then
    raise exception 'sandbox_tester_subject_conflict';
  end if;

  update public."sandbox_monetization_testers"
  set "status" = 'revoked',
      "revoked_at" = timezone('utc'::text, now())
  where "status" = 'active'
    and "user_id" = v_target_user_id::text;

  insert into public."sandbox_monetization_testers" (
    "user_id", "email", "status", "note", "expires_at", "created_by"
  ) values (
    v_target_user_id::text, v_email, 'active', v_note, p_expires_at, v_actor
  ) returning * into v_row;

  -- now() is fixed at transaction start; a queued mutation must use the
  -- wall clock and fresh session/role readback before it can commit authority.
  if not public."platform_exact_current_session_authority_internal"()
    or not public."wave1_current_caller_authority_internal"()
    or not exists (
      select 1 from auth.sessions session
      where session.user_id=auth.uid()
        and session.id::text=nullif(btrim(auth.jwt()->>'session_id'),'')
        and (session.not_after is null or session.not_after>clock_timestamp())
    )
    or not exists (
      select 1 from public."platform_role_memberships" membership
      where membership."user_id"=auth.uid()::text
        and membership."role" in ('owner','operator')
        and membership."status"='active'
        and (membership."expires_at" is null or membership."expires_at">clock_timestamp())
    )
  then raise exception 'platform_staff_auth_required'; end if;
  return jsonb_build_object(
    'id', v_row."id", 'userId', v_row."user_id", 'email', v_row."email",
    'status', v_row."status", 'expiresAt', v_row."expires_at",
    'createdAt', v_row."created_at", 'sandboxOnly', true,
    'notPayable', true, 'ownerRoleGranted', false,
    'payoutAccessGranted', false
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_grant_platform_role_by_email(p_target_email text, p_role text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- now() is fixed at transaction start; a queued mutation must use the
  -- wall clock and fresh session/role readback before it can commit authority.
  if not public."platform_exact_current_session_authority_internal"()
    or not public."wave1_current_caller_authority_internal"()
    or not exists (
      select 1 from auth.sessions session
      where session.user_id=auth.uid()
        and session.id::text=nullif(btrim(auth.jwt()->>'session_id'),'')
        and (session.not_after is null or session.not_after>clock_timestamp())
    )
    or not exists (
      select 1 from public."platform_role_memberships" membership
      where membership."user_id"=auth.uid()::text
        and membership."role" in ('owner','operator')
        and membership."status"='active'
        and (membership."expires_at" is null or membership."expires_at">clock_timestamp())
    )
  then raise exception 'platform_staff_auth_required'; end if;
  select membership."role" into v_actor_role
  from public."platform_role_memberships" membership
  where membership."user_id"=auth.uid()::text
    and membership."role" in ('owner','operator')
    and membership."status"='active'
    and (membership."expires_at" is null or membership."expires_at">clock_timestamp())
  order by case membership."role" when 'owner' then 0 else 1 end limit 1;
  if not public."platform_exact_current_session_authority_internal"()
    or not public."wave1_current_caller_authority_internal"() then
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

  -- now() is fixed at transaction start; a queued mutation must use the
  -- wall clock and fresh session/role readback before it can commit authority.
  if not public."platform_exact_current_session_authority_internal"()
    or not public."wave1_current_caller_authority_internal"()
    or not exists (
      select 1 from auth.sessions session
      where session.user_id=auth.uid()
        and session.id::text=nullif(btrim(auth.jwt()->>'session_id'),'')
        and (session.not_after is null or session.not_after>clock_timestamp())
    )
    or not exists (
      select 1 from public."platform_role_memberships" membership
      where membership."user_id"=auth.uid()::text
        and membership."role" in ('owner','operator')
        and membership."status"='active'
        and (membership."expires_at" is null or membership."expires_at">clock_timestamp())
    )
  then raise exception 'platform_staff_auth_required'; end if;
  select membership."role" into v_actor_role
  from public."platform_role_memberships" membership
  where membership."user_id"=auth.uid()::text
    and membership."role" in ('owner','operator')
    and membership."status"='active'
    and (membership."expires_at" is null or membership."expires_at">clock_timestamp())
  order by case membership."role" when 'owner' then 0 else 1 end limit 1;
  if v_actor_role is null or not (
    (v_actor_role='owner' and v_target_role in ('operator','moderator'))
    or (v_actor_role='operator' and v_target_role='moderator'
      and v_target_user_id::text<>v_actor_user_id
      and public."has_platform_permission"('manage_moderators')
      and exists (
        select 1 from public."platform_staff_permission_grants" grant_row
        where grant_row."target_user_id"=auth.uid()::text
          and grant_row."permission_key"=any(public."platform_admin_scope_legacy_aliases"('manage_moderators'))
          and grant_row."status"='active'
          and (grant_row."expires_at" is null or grant_row."expires_at">clock_timestamp())
      ))
  ) then raise exception 'platform_staff_permission_denied'; end if;
  perform public."platform_staff_write_audit"(
    v_actor_user_id, v_actor_email, v_actor_role, v_target_email,
    'grant', v_target_role, v_reason,
    jsonb_build_object('target_user_id', v_target_user_id, 'exact_subject', true)
  );

  -- now() is fixed at transaction start; a queued mutation must use the
  -- wall clock and fresh session/role readback before it can commit authority.
  if not public."platform_exact_current_session_authority_internal"()
    or not public."wave1_current_caller_authority_internal"()
    or not exists (
      select 1 from auth.sessions session
      where session.user_id=auth.uid()
        and session.id::text=nullif(btrim(auth.jwt()->>'session_id'),'')
        and (session.not_after is null or session.not_after>clock_timestamp())
    )
    or not exists (
      select 1 from public."platform_role_memberships" membership
      where membership."user_id"=auth.uid()::text
        and membership."role" in ('owner','operator')
        and membership."status"='active'
        and (membership."expires_at" is null or membership."expires_at">clock_timestamp())
    )
  then raise exception 'platform_staff_auth_required'; end if;
  select membership."role" into v_actor_role
  from public."platform_role_memberships" membership
  where membership."user_id"=auth.uid()::text
    and membership."role" in ('owner','operator')
    and membership."status"='active'
    and (membership."expires_at" is null or membership."expires_at">clock_timestamp())
  order by case membership."role" when 'owner' then 0 else 1 end limit 1;
  if v_actor_role is null or not (
    (v_actor_role='owner' and v_target_role in ('operator','moderator'))
    or (v_actor_role='operator' and v_target_role='moderator'
      and v_target_user_id::text<>v_actor_user_id
      and public."has_platform_permission"('manage_moderators')
      and exists (
        select 1 from public."platform_staff_permission_grants" grant_row
        where grant_row."target_user_id"=auth.uid()::text
          and grant_row."permission_key"=any(public."platform_admin_scope_legacy_aliases"('manage_moderators'))
          and grant_row."status"='active'
          and (grant_row."expires_at" is null or grant_row."expires_at">clock_timestamp())
      ))
  ) then raise exception 'platform_staff_permission_denied'; end if;
  return jsonb_build_object(
    'id', v_membership_id,
    'userId', v_target_user_id,
    'email', v_target_email,
    'role', v_target_role,
    'displayRole', case when v_target_role = 'operator' then 'admin' else v_target_role end,
    'status', 'active'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_grant_platform_role_by_email_pre_subject_closeout(p_target_email text, p_role text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- now() is fixed at transaction start; a queued mutation must use the
  -- wall clock and fresh session/role readback before it can commit authority.
  if not public."platform_exact_current_session_authority_internal"()
    or not public."wave1_current_caller_authority_internal"()
    or not exists (
      select 1 from auth.sessions session
      where session.user_id=auth.uid()
        and session.id::text=nullif(btrim(auth.jwt()->>'session_id'),'')
        and (session.not_after is null or session.not_after>clock_timestamp())
    )
    or not exists (
      select 1 from public."platform_role_memberships" membership
      where membership."user_id"=auth.uid()::text
        and membership."role" in ('owner','operator')
        and membership."status"='active'
        and (membership."expires_at" is null or membership."expires_at">clock_timestamp())
    )
  then raise exception 'platform_staff_auth_required'; end if;
  select membership."role" into v_actor_role
  from public."platform_role_memberships" membership
  where membership."user_id"=auth.uid()::text
    and membership."role" in ('owner','operator')
    and membership."status"='active'
    and (membership."expires_at" is null or membership."expires_at">clock_timestamp())
  order by case membership."role" when 'owner' then 0 else 1 end limit 1;
  if not public."platform_exact_current_session_authority_internal"()
    or not public."wave1_current_caller_authority_internal"() then
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

  -- now() is fixed at transaction start; a queued mutation must use the
  -- wall clock and fresh session/role readback before it can commit authority.
  if not public."platform_exact_current_session_authority_internal"()
    or not public."wave1_current_caller_authority_internal"()
    or not exists (
      select 1 from auth.sessions session
      where session.user_id=auth.uid()
        and session.id::text=nullif(btrim(auth.jwt()->>'session_id'),'')
        and (session.not_after is null or session.not_after>clock_timestamp())
    )
    or not exists (
      select 1 from public."platform_role_memberships" membership
      where membership."user_id"=auth.uid()::text
        and membership."role" in ('owner','operator')
        and membership."status"='active'
        and (membership."expires_at" is null or membership."expires_at">clock_timestamp())
    )
  then raise exception 'platform_staff_auth_required'; end if;
  select membership."role" into v_actor_role
  from public."platform_role_memberships" membership
  where membership."user_id"=auth.uid()::text
    and membership."role" in ('owner','operator')
    and membership."status"='active'
    and (membership."expires_at" is null or membership."expires_at">clock_timestamp())
  order by case membership."role" when 'owner' then 0 else 1 end limit 1;
  if v_actor_role is null or not (
    (v_actor_role='owner' and v_target_role in ('operator','moderator'))
    or (v_actor_role='operator' and v_target_role='moderator'
      and v_target_user_id::text<>v_actor_user_id
      and public."has_platform_permission"('manage_moderators')
      and exists (
        select 1 from public."platform_staff_permission_grants" grant_row
        where grant_row."target_user_id"=auth.uid()::text
          and grant_row."permission_key"=any(public."platform_admin_scope_legacy_aliases"('manage_moderators'))
          and grant_row."status"='active'
          and (grant_row."expires_at" is null or grant_row."expires_at">clock_timestamp())
      ))
  ) then raise exception 'platform_staff_permission_denied'; end if;
  perform public."platform_staff_write_audit"(
    v_actor_user_id, v_actor_email, v_actor_role, v_target_email,
    'grant', v_target_role, v_reason,
    jsonb_build_object('target_user_id', v_target_user_id, 'exact_subject', true)
  );

  -- now() is fixed at transaction start; a queued mutation must use the
  -- wall clock and fresh session/role readback before it can commit authority.
  if not public."platform_exact_current_session_authority_internal"()
    or not public."wave1_current_caller_authority_internal"()
    or not exists (
      select 1 from auth.sessions session
      where session.user_id=auth.uid()
        and session.id::text=nullif(btrim(auth.jwt()->>'session_id'),'')
        and (session.not_after is null or session.not_after>clock_timestamp())
    )
    or not exists (
      select 1 from public."platform_role_memberships" membership
      where membership."user_id"=auth.uid()::text
        and membership."role" in ('owner','operator')
        and membership."status"='active'
        and (membership."expires_at" is null or membership."expires_at">clock_timestamp())
    )
  then raise exception 'platform_staff_auth_required'; end if;
  select membership."role" into v_actor_role
  from public."platform_role_memberships" membership
  where membership."user_id"=auth.uid()::text
    and membership."role" in ('owner','operator')
    and membership."status"='active'
    and (membership."expires_at" is null or membership."expires_at">clock_timestamp())
  order by case membership."role" when 'owner' then 0 else 1 end limit 1;
  if v_actor_role is null or not (
    (v_actor_role='owner' and v_target_role in ('operator','moderator'))
    or (v_actor_role='operator' and v_target_role='moderator'
      and v_target_user_id::text<>v_actor_user_id
      and public."has_platform_permission"('manage_moderators')
      and exists (
        select 1 from public."platform_staff_permission_grants" grant_row
        where grant_row."target_user_id"=auth.uid()::text
          and grant_row."permission_key"=any(public."platform_admin_scope_legacy_aliases"('manage_moderators'))
          and grant_row."status"='active'
          and (grant_row."expires_at" is null or grant_row."expires_at">clock_timestamp())
      ))
  ) then raise exception 'platform_staff_permission_denied'; end if;
  return jsonb_build_object(
    'id', v_membership_id,
    'userId', v_target_user_id,
    'email', v_target_email,
    'role', v_target_role,
    'displayRole', case when v_target_role = 'operator' then 'admin' else v_target_role end,
    'status', 'active'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_grant_platform_role_by_email_pre_exact_subject_closure(p_target_email text, p_role text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_target_email text:=public."platform_staff_normalize_email"(p_target_email);
  v_target_role text:=public."platform_staff_normalize_role"(p_role);
  v_target_ids uuid[];
  v_target_user_id uuid;
  v_membership_ids bigint[];
  v_membership_id bigint;
  v_result jsonb;
begin
  -- now() is fixed at transaction start; a queued mutation must use the
  -- wall clock and fresh session/role readback before it can commit authority.
  if not public."platform_exact_current_session_authority_internal"()
    or not public."wave1_current_caller_authority_internal"()
    or not exists (
      select 1 from auth.sessions session
      where session.user_id=auth.uid()
        and session.id::text=nullif(btrim(auth.jwt()->>'session_id'),'')
        and (session.not_after is null or session.not_after>clock_timestamp())
    )
    or not exists (
      select 1 from public."platform_role_memberships" membership
      where membership."user_id"=auth.uid()::text
        and membership."role" in ('owner','operator')
        and membership."status"='active'
        and (membership."expires_at" is null or membership."expires_at">clock_timestamp())
    )
  then raise exception 'platform_staff_auth_required'; end if;
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
  -- now() is fixed at transaction start; a queued mutation must use the
  -- wall clock and fresh session/role readback before it can commit authority.
  if not public."platform_exact_current_session_authority_internal"()
    or not public."wave1_current_caller_authority_internal"()
    or not exists (
      select 1 from auth.sessions session
      where session.user_id=auth.uid()
        and session.id::text=nullif(btrim(auth.jwt()->>'session_id'),'')
        and (session.not_after is null or session.not_after>clock_timestamp())
    )
    or not exists (
      select 1 from public."platform_role_memberships" membership
      where membership."user_id"=auth.uid()::text
        and membership."role" in ('owner','operator')
        and membership."status"='active'
        and (membership."expires_at" is null or membership."expires_at">clock_timestamp())
    )
  then raise exception 'platform_staff_auth_required'; end if;
  return v_result||jsonb_build_object('userId',v_target_user_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.watch_party_room_access_pre_live_decouple(p_party_id text, p_user_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_auth_user text := auth.uid()::text;
  v_request_role text := auth.role();
  v_room public."watch_party_rooms"%rowtype;
  v_paid_ticket_required boolean := false;
begin
  if p_party_id is distinct from upper(btrim(coalesce(p_party_id, '')))
    or nullif(trim(coalesce(p_party_id, '')), '') is null
    or nullif(trim(coalesce(p_user_id, '')), '') is null
  then
    return false;
  end if;
  select room.* into v_room
  from public."watch_party_rooms" room
  where room."party_id" = p_party_id;
  if v_room."party_id" is null then return false; end if;
  -- Bind both sides to a surviving immutable account before any fast allow.
  -- Ordinary room authority does not add an email-only sign-in requirement.
  if not exists (select 1 from auth.users subject
      where subject.id::text = p_user_id and subject.deleted_at is null)
    or not exists (select 1 from auth.users subject
      where subject.id = v_room."host_user_id" and subject.deleted_at is null)
    or public."is_account_access_restricted"(p_user_id)
    or public."is_account_access_restricted"(v_room."host_user_id"::text)
  then return false; end if;
  if v_request_role is distinct from 'service_role'
    and (
      v_auth_user is null
      or not public."whole_app_exact_current_session_authority_internal"()
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
    if not v_paid_ticket_required then
      return v_room."content_access_rule" in ('open','party_pass','premium');
    end if;
    return not public."revenuecat_authority_quarantined_internal"(
        null,v_room."host_user_id",null
      )
      and public."wave1_creator_money_subject_authorized_internal"(v_room."host_user_id")
      and exists (
        select 1 from public."paid_watch_party_offers" offer
        where offer."party_id"=p_party_id
          and offer."creator_id"=v_room."host_user_id"
          and offer."host_id"=v_room."host_user_id"
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
     and offer."creator_id" = v_room."host_user_id"
     and offer."host_id" = v_room."host_user_id"
    join public."monetization_products" product
      on product."id" = grant_row."product_id"
     and product."product_type" = 'watch_party_live_ticket'
    join public."provider_events" provider_event
      on provider_event."id" = grant_row."provider_event_id"
     and provider_event."provider" in ('revenuecat_app_store','revenuecat_google_play')
     and provider_event."provider" = grant_row."provider"
     and provider_event."product_id" = grant_row."product_id"
     and provider_event."environment" = grant_row."environment"
     and provider_event."status" = 'processed'
     and provider_event."user_id"::text = p_user_id
     and not public."revenuecat_authority_quarantined_internal"(
       provider_event."provider",provider_event."user_id",provider_event."environment"
     )
    join public."money_purchase_intents" intent
      on intent."id"::text = grant_row."metadata"->>'purchase_intent_id'
     and intent."id"::text = provider_event."metadata"->>'purchase_intent_id'
     and intent."user_id"::text = p_user_id
     and intent."product_id" = grant_row."product_id"
     and intent."product_key" = product."product_key"
     and intent."product_type" = 'watch_party_live_ticket'
     and intent."source_type" = 'watch_party_live'
     and intent."environment" = grant_row."environment"
     and intent."consumed_at" is not null
     and intent."revoked_at" is null
     and intent."amount_minor" = offer."price_cents"
     and lower(intent."currency") = lower(offer."currency")
     and intent."source_id" = offer."id"
     and intent."creator_id" = offer."creator_id"
     and intent."provider" = provider_event."provider"
     and intent."provider_product_id" = provider_event."metadata"->>'provider_product_id'
     and intent."status" = 'consumed'
    join public."revenuecat_consumable_transaction_intents" transaction_link
      on transaction_link."purchase_intent_id" = intent."id"
     and transaction_link."provider" = provider_event."provider"
     and transaction_link."original_transaction_id" = grant_row."metadata"->>'original_transaction_id'
     and transaction_link."original_transaction_id" = provider_event."metadata"->>'original_transaction_id'
     and nullif(btrim(transaction_link."original_transaction_id"),'') is not null
     and transaction_link."user_id" = grant_row."user_id"
     and transaction_link."product_id" = grant_row."product_id"
     and transaction_link."provider_event_id" = provider_event."id"
     and transaction_link."binding_state" = 'exact'
     and not transaction_link."terminal"
    join public."paid_watch_party_tickets" ticket
      on ticket."access_grant_id"=grant_row."id"
     and ticket."offer_id"=offer."id"
     and ticket."party_id"=offer."party_id"
     and ticket."buyer_id"=grant_row."user_id"
     and ticket."creator_id"=offer."creator_id"
     and ticket."host_id"=offer."host_id"
     and ticket."provider"=grant_row."provider"
     and ticket."provider_transaction_id"=provider_event."provider_event_id"
     and ticket."metadata"->'viewer_access_only' = 'true'::jsonb
     and coalesce(ticket."metadata"->'grants_livekit_publish','false'::jsonb) = 'false'::jsonb
     and coalesce(ticket."metadata"->'grants_host_authority','false'::jsonb) = 'false'::jsonb
     and ticket."status"='active'
     and ticket."refunded_at" is null
     and ticket."revoked_at" is null
     and (ticket."expires_at" is null or ticket."expires_at">timezone('utc'::text,now()))
    where grant_row."user_id"::text = p_user_id
      and grant_row."grant_type" = 'watch_party_live_ticket'
      and grant_row."source_type" = 'provider_event'
      and grant_row."environment" in ('sandbox','production')
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
$function$;

CREATE OR REPLACE FUNCTION public.resolve_watch_party_livekit_authority_pre_service_fix(p_party_id text, p_user_id uuid, p_session_generation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz:=timezone('utc'::text,now());
  v_paid_required boolean := false;
  v_allowed boolean := false;
  v_is_host boolean := false;
  v_expires_at timestamptz;
  v_room public."watch_party_rooms"%rowtype;
begin
  if p_party_id is distinct from upper(btrim(coalesce(p_party_id, '')))
    or p_user_id is null or p_session_generation is null
    or nullif(trim(coalesce(p_party_id,'')),'') is null
    or public."is_account_access_restricted"(p_user_id::text)
    or not public."money_purchase_intent_session_authorized_internal"(
      p_user_id,p_session_generation::text
    )
  then
    return jsonb_build_object('allowed',false,'paidSeatRequired',false,'hostAuthority',false,'expiresAt',null,'reason','viewer_authority_invalid');
  end if;
  select room.* into v_room from public."watch_party_rooms" room
  where room."party_id"=p_party_id;
  if v_room."party_id" is null
    or not exists (select 1 from auth.users subject
      where subject.id=p_user_id and subject.deleted_at is null)
    or not exists (select 1 from auth.users subject
      where subject.id=v_room."host_user_id" and subject.deleted_at is null)
    or public."is_account_access_restricted"(v_room."host_user_id"::text)
  then
    return jsonb_build_object('allowed',false,'paidSeatRequired',false,
      'hostAuthority',false,'expiresAt',null,'reason','viewer_authority_invalid');
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
      v_expires_at:=least(v_expires_at,
        (select session.not_after from auth.sessions session
          where session.id=p_session_generation and session.user_id=p_user_id));
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
      on offer."id" = grant_row."source_id"
     and offer."party_id" = p_party_id
     and offer."creator_id" = v_room."host_user_id"
     and offer."host_id" = v_room."host_user_id"
    join public."monetization_products" product
      on product."id" = grant_row."product_id"
     and product."product_type" = 'watch_party_live_ticket'
    join public."provider_events" provider_event
      on provider_event."id" = grant_row."provider_event_id"
     and provider_event."provider" in ('revenuecat_app_store','revenuecat_google_play')
     and provider_event."provider" = grant_row."provider"
     and provider_event."product_id" = grant_row."product_id"
     and provider_event."environment" = grant_row."environment"
     and provider_event."status" = 'processed'
     and provider_event."user_id"::text = p_user_id::text
     and not public."revenuecat_authority_quarantined_internal"(
       provider_event."provider",provider_event."user_id",provider_event."environment"
     )
    join public."money_purchase_intents" intent
      on intent."id"::text = grant_row."metadata"->>'purchase_intent_id'
     and intent."id"::text = provider_event."metadata"->>'purchase_intent_id'
     and intent."user_id"::text = p_user_id::text
     and intent."product_id" = grant_row."product_id"
     and intent."product_key" = product."product_key"
     and intent."product_type" = 'watch_party_live_ticket'
     and intent."source_type" = 'watch_party_live'
     and intent."environment" = grant_row."environment"
     and intent."consumed_at" is not null
     and intent."revoked_at" is null
     and intent."amount_minor" = offer."price_cents"
     and lower(intent."currency") = lower(offer."currency")
     and intent."source_id" = offer."id"
     and intent."creator_id" = offer."creator_id"
     and intent."provider" = provider_event."provider"
     and intent."provider_product_id" = provider_event."metadata"->>'provider_product_id'
     and intent."status" = 'consumed'
    join public."revenuecat_consumable_transaction_intents" transaction_link
      on transaction_link."purchase_intent_id" = intent."id"
     and transaction_link."provider" = provider_event."provider"
     and transaction_link."original_transaction_id" = grant_row."metadata"->>'original_transaction_id'
     and transaction_link."original_transaction_id" = provider_event."metadata"->>'original_transaction_id'
     and nullif(btrim(transaction_link."original_transaction_id"),'') is not null
     and transaction_link."user_id" = grant_row."user_id"
     and transaction_link."product_id" = grant_row."product_id"
     and transaction_link."provider_event_id" = provider_event."id"
     and transaction_link."binding_state" = 'exact'
     and not transaction_link."terminal"
    join public."paid_watch_party_tickets" ticket
      on ticket."access_grant_id"=grant_row."id"
     and ticket."offer_id"=offer."id"
     and ticket."party_id"=offer."party_id"
     and ticket."buyer_id"=grant_row."user_id"
     and ticket."creator_id"=offer."creator_id"
     and ticket."host_id"=offer."host_id"
     and ticket."provider"=grant_row."provider"
     and ticket."provider_transaction_id"=provider_event."provider_event_id"
     and ticket."metadata"->'viewer_access_only' = 'true'::jsonb
     and coalesce(ticket."metadata"->'grants_livekit_publish','false'::jsonb) = 'false'::jsonb
     and coalesce(ticket."metadata"->'grants_host_authority','false'::jsonb) = 'false'::jsonb
     and ticket."status"='active'
     and ticket."refunded_at" is null
     and ticket."revoked_at" is null
     and (ticket."expires_at" is null or ticket."expires_at">timezone('utc'::text,now()))
    where grant_row."user_id"::text = p_user_id::text
      and grant_row."grant_type" = 'watch_party_live_ticket'
      and grant_row."source_type" = 'provider_event'
      and grant_row."environment" in ('sandbox','production')
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
    order by grant_row."created_at" desc,grant_row."id" desc limit 1;
  if not found then
    return jsonb_build_object('allowed',false,'paidSeatRequired',true,
      'hostAuthority',false,'expiresAt',null,'reason','exact_paid_seat_authority_required');
  end if;
  v_expires_at:=least(coalesce(v_expires_at,v_now+interval '30 seconds'),
    v_now+interval '30 seconds',
    (select session.not_after from auth.sessions session
      where session.id=p_session_generation and session.user_id=p_user_id));
  return jsonb_build_object(
    'allowed',true,'paidSeatRequired',true,'hostAuthority',false,'expiresAt',v_expires_at,
    'reason','exact_paid_seat_viewer_authority'
  );
end;
$function$;

create or replace function public."watch_party_room_self_access_allowed_internal"(
  p_party_id text,
  p_user_id text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_party_id text := pg_catalog.upper(
    pg_catalog.btrim(coalesce(p_party_id, ''))
  );
  v_user_id text := nullif(pg_catalog.btrim(coalesce(p_user_id, '')), '');
  v_auth_user_id text := nullif(auth.uid()::text, '');
  v_request_role text := coalesce(
    nullif(auth.role(), ''),
    nullif(pg_catalog.current_setting('role', true), ''),
    session_user::text
  );
  v_service_authority boolean := false;
  v_room public."watch_party_rooms"%rowtype;
begin
  if p_party_id is distinct from v_party_id or v_party_id = '' or v_user_id is null then
    return false;
  end if;
  select room.* into v_room from public."watch_party_rooms" room
  where room."party_id"=v_party_id;
  if v_room."party_id" is null
    or not exists (select 1 from auth.users subject
      where subject.id::text=v_user_id and subject.deleted_at is null)
    or not exists (select 1 from auth.users subject
      where subject.id=v_room."host_user_id" and subject.deleted_at is null)
    or public."is_account_access_restricted"(v_user_id)
    or public."is_account_access_restricted"(v_room."host_user_id"::text)
  then return false; end if;
  if public."watch_party_room_access_pre_live_decouple"(
    p_party_id,
    p_user_id
  ) then
    return true;
  end if;

  if v_party_id = '' or v_user_id is null then
    return false;
  end if;

  select room.* into v_room
  from public."watch_party_rooms" room
  where room."party_id" = v_party_id;

  if v_room."party_id" is null
    or not coalesce(v_room."is_active", false)
    or v_room."room_type" <> 'live'
    or exists (
      select 1
      from public."paid_watch_party_offers" offer
      where offer."party_id" = v_party_id
        and offer."status" in (
          'sandbox', 'active', 'paused', 'sold_out', 'blocked'
        )
    )
  then
    return false;
  end if;

  v_service_authority := v_request_role = 'service_role'
    or (
      coalesce(auth.jwt() ->> 'role', '') not in ('authenticated', 'anon')
      and session_user::text in ('postgres', 'supabase_admin')
    );
  if not v_service_authority then
    if v_auth_user_id is null
      or v_auth_user_id not in (v_user_id, v_room."host_user_id"::text)
      or not public."whole_app_exact_current_session_authority_internal"()
    then
      return false;
    end if;
  end if;

  if public."is_account_access_restricted"(v_user_id)
    or public."is_account_access_restricted"(v_room."host_user_id"::text)
    or public."watch_party_room_actor_blocked_by_host"(
      v_party_id,
      v_user_id
    )
  then
    return false;
  end if;

  if v_room."host_user_id"::text = v_user_id then
    return v_room."content_access_rule" in ('open', 'party_pass', 'premium');
  elsif v_room."content_access_rule" = 'open' then
    return true;
  elsif v_room."content_access_rule" = 'party_pass' then
    return public."premium_subject_has_finite_authority_internal"(v_user_id);
  elsif v_room."content_access_rule" = 'premium' then
    return public."premium_subject_has_finite_authority_internal"(v_user_id);
  end if;

  return false;
end;
$$;

create or replace function public.resolve_watch_party_livekit_viewer_authority(p_party_id text,p_user_id uuid,p_session_generation uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.watch_party_rooms; baseline jsonb;
begin
  select * into r from public.watch_party_rooms where party_id=p_party_id;
  if p_party_id is distinct from upper(btrim(coalesce(p_party_id,'')))
    or r.party_id is null or p_user_id is null
    or not exists(select 1 from auth.users subject where subject.id=p_user_id and subject.deleted_at is null)
    or not exists(select 1 from auth.users subject where subject.id=r.host_user_id and subject.deleted_at is null)
    or public.is_account_access_restricted(p_user_id::text)
    or public.is_account_access_restricted(r.host_user_id::text)
  then
    return jsonb_build_object('allowed',false,'paidSeatRequired',false,
      'speakerEligible',false,'hostAuthority',false,'expiresAt',null,'reason','viewer_authority_invalid');
  end if;
  baseline:=public.resolve_watch_party_livekit_pre_party_room(p_party_id,p_user_id,p_session_generation);
  select * into r from public.watch_party_rooms where party_id=upper(nullif(btrim(p_party_id),''));
  -- The old free-room Premium predicate calls user_has_active_entitlement,
  -- which requires the viewer's JWT even when this service-only RPC receives
  -- an exact target session. Correct only that demonstrated false negative for
  -- current canonical Party Room publications, using target authority directly.
  if baseline->>'allowed' is distinct from 'true' then
    if auth.role()='service_role' and baseline->>'reason'='room_viewer_authority_required'
      and r.room_type='title' and r.content_access_rule in ('premium','party_pass')
      and p_session_generation is not null and p_user_id is not null
      and not coalesce((baseline->>'paidSeatRequired')::boolean,true)
      and not exists(select 1 from public.paid_watch_party_offers o where o.party_id=r.party_id
        and o.status in ('sandbox','active','paused','sold_out','blocked'))
      and public.money_purchase_intent_session_authorized_internal(p_user_id,p_session_generation::text)
      and private.party_room_publication_current(r.party_id)
      and not public.is_account_access_restricted(p_user_id::text)
      and not public.watch_party_room_actor_blocked_by_host(r.party_id,p_user_id::text)
      and private.party_room_viewer_source_allowed(r,p_user_id)
      and exists(select 1 from public.watch_party_room_memberships m where m.party_id=r.party_id and m.user_id=p_user_id::text
        and m.membership_state in ('active','reconnecting') and m.left_at is null and m.last_seen_at>=now()-interval '45 seconds')
    then
      return jsonb_build_object('allowed',true,'paidSeatRequired',false,'speakerEligible',true,
        'hostAuthority',r.host_user_id=p_user_id,'expiresAt',least(now()+interval '30 seconds',
          (select s.not_after from auth.sessions s where s.id=p_session_generation and s.user_id=p_user_id),
          (select min(e.expires_at) from public.user_entitlements e where e.user_id in (p_user_id::text,r.host_user_id::text)
            and e.entitlement_key='premium' and e.expires_at>now())),
        'reason','canonical_party_room_target_premium_authority');
    end if;
    return baseline;
  end if;
  if not private.party_room_viewer_source_allowed(r,p_user_id) then
    return jsonb_build_object('allowed',false,'paidSeatRequired',coalesce((baseline->>'paidSeatRequired')::boolean,false),
      'speakerEligible',false,'hostAuthority',false,'expiresAt',null,'reason','room_viewer_authority_required');
  end if;
  return baseline;
end $$;

-- Preserve the operation-key fingerprint and receipt algorithm while denying
-- a no-longer-current session after a queue, receipt read or receipt write.
CREATE OR REPLACE FUNCTION public.admin_grant_platform_role_by_email(p_target_email text, p_role text, p_reason text, p_operation_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor_user_id text := auth.uid()::text;
  v_actor_role text;
  v_target_email text := public."platform_staff_normalize_email"(p_target_email);
  v_target_role text := public."platform_staff_normalize_role"(p_role);
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_operation_key text := lower(btrim(coalesce(p_operation_key, '')));
  v_request_fingerprint jsonb;
  v_prior_request jsonb;
  v_prior_result jsonb;
  v_result jsonb;
begin
  -- Recheck after any queue/write wait: transaction-start now() is insufficient.
  if not public."platform_exact_current_session_authority_internal"()
    or not public."wave1_current_caller_authority_internal"()
    or not exists (
      select 1 from auth.sessions session
      where session.user_id=auth.uid()
        and session.id::text=nullif(btrim(auth.jwt()->>'session_id'),'')
        and (session.not_after is null or session.not_after>clock_timestamp())
    )
  then raise exception 'platform_staff_auth_required'; end if;
  if v_actor_user_id is null
    or not public."platform_exact_current_session_authority_internal"()
  then
    raise exception 'platform_staff_auth_required';
  end if;
  if v_target_email is null then raise exception 'platform_staff_email_required'; end if;
  if v_target_role is null then raise exception 'platform_staff_role_invalid'; end if;
  if v_reason is null or length(v_reason) < 6 then
    raise exception 'platform_staff_reason_required';
  end if;
  if v_operation_key !~ '^staff-role-grant:[0-9a-f]{32}$' then
    raise exception 'platform_staff_operation_key_required';
  end if;

  v_request_fingerprint := jsonb_build_object(
    'target_email', v_target_email,
    'target_role', v_target_role,
    'reason', v_reason
  );
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'staff-role-grant:' || v_actor_user_id || ':' || v_operation_key,
    0
  ));

  -- Recheck after any queue/write wait: transaction-start now() is insufficient.
  if not public."platform_exact_current_session_authority_internal"()
    or not public."wave1_current_caller_authority_internal"()
    or not exists (
      select 1 from auth.sessions session
      where session.user_id=auth.uid()
        and session.id::text=nullif(btrim(auth.jwt()->>'session_id'),'')
        and (session.not_after is null or session.not_after>clock_timestamp())
    )
  then raise exception 'platform_staff_auth_required'; end if;
  select receipt."request_fingerprint", receipt."result_payload"
    into v_prior_request, v_prior_result
  from public."privileged_mutation_operation_receipts" receipt
  where receipt."operation_family" = 'staff_role_grant'
    and receipt."actor_user_id" = v_actor_user_id
    and receipt."operation_key" = v_operation_key;

  if found then
    if v_prior_request is distinct from v_request_fingerprint then
      raise exception 'platform_staff_operation_key_conflict';
    end if;
  -- Recheck after any queue/write wait: transaction-start now() is insufficient.
  if not public."platform_exact_current_session_authority_internal"()
    or not public."wave1_current_caller_authority_internal"()
    or not exists (
      select 1 from auth.sessions session
      where session.user_id=auth.uid()
        and session.id::text=nullif(btrim(auth.jwt()->>'session_id'),'')
        and (session.not_after is null or session.not_after>clock_timestamp())
    )
  then raise exception 'platform_staff_auth_required'; end if;
    return v_prior_result || jsonb_build_object('idempotent', true);
  end if;

  v_result := public."admin_grant_platform_role_by_email"(
    v_target_email,
    v_target_role,
    v_reason
  );

  insert into public."privileged_mutation_operation_receipts" (
    "operation_family",
    "actor_user_id",
    "operation_key",
    "request_fingerprint",
    "result_payload",
    "result_target_id"
  ) values (
    'staff_role_grant',
    v_actor_user_id,
    v_operation_key,
    v_request_fingerprint,
    v_result,
    v_result->>'id'
  );

  -- Recheck after any queue/write wait: transaction-start now() is insufficient.
  if not public."platform_exact_current_session_authority_internal"()
    or not public."wave1_current_caller_authority_internal"()
    or not exists (
      select 1 from auth.sessions session
      where session.user_id=auth.uid()
        and session.id::text=nullif(btrim(auth.jwt()->>'session_id'),'')
        and (session.not_after is null or session.not_after>clock_timestamp())
    )
  then raise exception 'platform_staff_auth_required'; end if;
  -- A new mutation's receipt write can wait after the inner grant's final
  -- authorization check. Recheck the same exact target contract here too.
  -- Prior actor-bound receipt replay above retains its existing semantics.
  select membership."role" into v_actor_role
  from public."platform_role_memberships" membership
  where membership."user_id"=v_actor_user_id
    and membership."role" in ('owner','operator')
    and membership."status"='active'
    and (membership."expires_at" is null or membership."expires_at">clock_timestamp())
  order by case membership."role" when 'owner' then 0 else 1 end limit 1;
  if v_actor_role is null or not (
    (v_actor_role='owner' and v_target_role in ('operator','moderator'))
    or (v_actor_role='operator' and v_target_role='moderator'
      and nullif(v_result->>'userId','') is not null
      and nullif(v_result->>'userId','')<>v_actor_user_id
      and public."has_platform_permission"('manage_moderators')
      and exists (
        select 1 from public."platform_staff_permission_grants" grant_row
        where grant_row."target_user_id"=v_actor_user_id
          and grant_row."permission_key"=any(public."platform_admin_scope_legacy_aliases"('manage_moderators'))
          and grant_row."status"='active'
          and (grant_row."expires_at" is null or grant_row."expires_at">clock_timestamp())
      ))
  ) then raise exception 'platform_staff_permission_denied'; end if;
  return v_result || jsonb_build_object('idempotent', false);
end;
$function$;

create or replace function public."apply_revenuecat_terminal_quarantine_projection_internal"(
  p_quarantine_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quarantine public."revenuecat_terminal_authority_quarantines"%rowtype;
begin
  select quarantine.* into v_quarantine
  from public."revenuecat_terminal_authority_quarantines" quarantine
  where quarantine."id"=p_quarantine_id;
  if v_quarantine."id" is null then
    raise exception 'revenuecat_terminal_quarantine_missing';
  end if;

  -- Mutable grant rows are projections, not immutable provider evidence. Close
  -- every grant inside the narrowest provable scope; never choose a transaction.
  update public."access_grants" grant_row
  set "status"='blocked',
      "revoked_at"=coalesce(grant_row."revoked_at",v_quarantine."created_at"),
      "revoke_reason"='RevenueCat terminal authority quarantine.',
      "metadata"=coalesce(grant_row."metadata",'{}'::jsonb)||jsonb_build_object(
        'authority_granted',false,
        'terminal_quarantine_id',v_quarantine."id",
        'terminal_quarantine_reason',v_quarantine."reason"
      ),
      "updated_at"=timezone('utc'::text,now())
  where grant_row."provider" in ('revenuecat_app_store','revenuecat_google_play')
    and grant_row."status" in ('active','sandbox_only')
    and (v_quarantine."provider_scope"='revenuecat_global'
      or grant_row."provider"=v_quarantine."provider_scope")
    and (v_quarantine."user_id" is null
      or grant_row."user_id"=v_quarantine."user_id")
    and (v_quarantine."environment_scope" is null
      or grant_row."environment"=v_quarantine."environment_scope");

  -- Already-admitted realtime membership is another mutable projection. Remove
  -- it for paid/Premium rooms immediately; a later token/heartbeat may not be
  -- required before chat/realtime membership is consulted.
  update public."watch_party_room_memberships" membership
  -- Host role/stage/can_speak are identity invariants, even after removal.
  -- Preserve those existing fields only for the immutable room host. Effective
  -- authority is revoked by removed state, left_at, disabled media and durable
  -- quarantine; changing the host identity would make the existing trigger
  -- reject and roll back the quarantine itself.
  set "role"=case when membership."user_id"=room."host_user_id"::text
        then membership."role" else 'viewer' end,
      "stage_role"=case when membership."user_id"=room."host_user_id"::text
        then membership."stage_role" else 'listener' end,
      "can_speak"=case when membership."user_id"=room."host_user_id"::text
        then membership."can_speak" else false end,
      "camera_enabled"=false,"mic_enabled"=false,"membership_state"='removed',
      "left_at"=coalesce(membership."left_at",v_quarantine."created_at"),
      "updated_at"=timezone('utc'::text,now())
  from public."watch_party_rooms" room
  where room."party_id"=membership."party_id"
    and membership."membership_state" in ('active','reconnecting')
    and (v_quarantine."user_id" is null
      or membership."user_id"=v_quarantine."user_id"::text)
    and (
      room."content_access_rule" in ('premium','party_pass')
      or exists (
        select 1 from public."paid_watch_party_offers" offer
        where offer."party_id"=room."party_id"
          and offer."status" in ('sandbox','active','paused','sold_out','blocked')
      )
    );
end;
$$;

-- Restore source-intended self-read predicates without changing table grants.
drop policy if exists "platform_role_memberships_select_own"
  on public."platform_role_memberships";
create policy "platform_role_memberships_select_own"
  on public."platform_role_memberships"
  for select to authenticated
  using (
    public."platform_exact_current_session_subject"("user_id")
    and "status" = 'active'
    and ("expires_at" is null
      or "expires_at" > timezone('utc'::text, now()))
  );

drop policy if exists "platform_staff_permission_grants_select_owner_or_self"
  on public."platform_staff_permission_grants";
create policy "platform_staff_permission_grants_select_owner_or_self"
  on public."platform_staff_permission_grants"
  for select to authenticated
  using (
    public."has_platform_role"(array['owner'::text])
    or (
      public."platform_exact_current_session_subject"("target_user_id")
      and "status" = 'active'
      and ("expires_at" is null
        or "expires_at" > timezone('utc'::text, now()))
    )
  );

-- These grant EXECUTE only. The restored implementations still derive authority
-- from the exact authenticated subject and live session; an unbound service JWT
-- must not return beta/tester authority.
grant execute on function public."has_active_beta_access"()
  to service_role;
grant execute on function public."resolve_sandbox_monetization_tester"(text,text)
  to service_role;

-- Already unusable without INSERT/UPDATE grants; remove latent policy drift.
drop policy if exists "watch_party_room_memberships_self_insert_policy"
  on public."watch_party_room_memberships";
drop policy if exists "watch_party_room_memberships_self_update_policy"
  on public."watch_party_room_memberships";


commit;
