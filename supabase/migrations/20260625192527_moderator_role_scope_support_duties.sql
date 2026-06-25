-- Moderator role scope and support duties.
--
-- Support is a work area, not a backend role. This migration keeps the
-- existing role values and lets exact-scoped Moderator staff use DMCA/case
-- support tooling without becoming Admin/operator staff.

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
        public.has_platform_role(array['operator'::text, 'moderator'::text])
        and (
          public.has_platform_permission('dmca_review')
          or public.has_platform_permission('copyright_review')
          or public.has_platform_permission('legal_review')
          or public.has_platform_permission('admin.dmca.view')
          or public.has_platform_permission('admin.dmca.manage')
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
    raise exception 'dmca_owner_or_scoped_staff_required';
  end if;
end;
$$;

revoke all on function public."dmca_can_access_admin"() from public;
revoke all on function public."dmca_can_access_admin"() from "anon";
revoke all on function public."dmca_can_access_admin"() from "authenticated";
grant execute on function public."dmca_can_access_admin"() to "authenticated";
grant execute on function public."dmca_can_access_admin"() to "service_role";

revoke all on function public."dmca_assert_owner_operator"() from public;
revoke all on function public."dmca_assert_owner_operator"() from "anon";
revoke all on function public."dmca_assert_owner_operator"() from "authenticated";
grant execute on function public."dmca_assert_owner_operator"() to "authenticated";
grant execute on function public."dmca_assert_owner_operator"() to "service_role";

comment on function public."dmca_can_access_admin"() is
  'Allows Owner, or active Admin/operator or Moderator staff with exact DMCA/legal scopes, to access DMCA Admin support tooling. Support is a work area, not a backend role.';

comment on function public."dmca_assert_owner_operator"() is
  'Legacy-named DMCA assertion; enforces Owner or exact-scoped Admin/Moderator staff without creating a support backend role.';

create or replace function public."admin_grant_platform_role_by_email"(
  p_target_email text,
  p_role text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
$$;

create or replace function public."admin_revoke_platform_role_by_email"(
  p_target_email text,
  p_role text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text := public.platform_staff_actor_role();
  v_actor_user_id text := auth.uid()::text;
  v_actor_email text := public.platform_staff_normalize_email(auth.jwt() ->> 'email');
  v_target_email text := public.platform_staff_normalize_email(p_target_email);
  v_target_role text := public.platform_staff_normalize_role(p_role);
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_role_id bigint;
  v_target_active_count integer;
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
    if not public.is_first_owner(v_actor_user_id, v_actor_email) then
      perform public.platform_first_owner_write_audit(
        v_actor_user_id,
        v_actor_email,
        coalesce(v_actor_role, 'member'),
        'revoke_owner',
        null,
        v_target_email,
        null,
        coalesce(v_reason, 'Only First Owner can revoke Owner.'),
        'denied',
        jsonb_build_object('blocked_reason', 'first_owner_required', 'legacy_rpc', true)
      );
      raise exception 'first_owner_required';
    end if;

    return public.first_owner_revoke_owner_by_email(v_target_email, v_reason);
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

  select count(*) into v_target_active_count
  from public."platform_role_memberships"
  where "status" = 'active'
    and "role" = v_target_role
    and lower("email") = v_target_email;

  if coalesce(v_target_active_count, 0) = 0 then
    raise exception 'platform_staff_role_not_found';
  end if;

  update public."platform_role_memberships"
  set
    "status" = 'revoked',
    "revoked_by" = v_actor_user_id,
    "revoked_at" = timezone('utc'::text, now()),
    "updated_at" = timezone('utc'::text, now()),
    "notes" = v_reason
  where "status" = 'active'
    and "role" = v_target_role
    and lower("email") = v_target_email
  returning "id" into v_role_id;

  if v_target_role = 'operator' then
    update public."platform_staff_permission_grants"
    set
      "status" = 'revoked',
      "revoked_by" = v_actor_user_id,
      "revoked_at" = timezone('utc'::text, now()),
      "updated_at" = timezone('utc'::text, now()),
      "reason" = v_reason
    where "status" = 'active'
      and lower("target_email") = v_target_email;
  end if;

  perform public.platform_staff_write_audit(
    v_actor_user_id,
    v_actor_email,
    v_actor_role,
    v_target_email,
    'revoke',
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
    'status', 'revoked'
  );
end;
$$;

revoke all on function public."admin_grant_platform_role_by_email"(text, text, text) from public;
revoke all on function public."admin_grant_platform_role_by_email"(text, text, text) from "anon";
revoke all on function public."admin_revoke_platform_role_by_email"(text, text, text) from public;
revoke all on function public."admin_revoke_platform_role_by_email"(text, text, text) from "anon";
grant execute on function public."admin_grant_platform_role_by_email"(text, text, text) to authenticated, service_role;
grant execute on function public."admin_revoke_platform_role_by_email"(text, text, text) to authenticated, service_role;

comment on function public."admin_grant_platform_role_by_email"(text, text, text) is
  'Security-definer staff grant RPC. Owner may grant Admin/operator and Moderator. Admin/operator with manage_moderators may grant Moderator. Moderator cannot grant Owner/Admin/operator or staff roles.';

comment on function public."admin_revoke_platform_role_by_email"(text, text, text) is
  'Security-definer staff revoke RPC preserving First Owner owner-revoke path. Owner may revoke Admin/operator and Moderator. Admin/operator with manage_moderators may revoke Moderator. Moderator cannot revoke Owner/Admin/operator or staff roles.';
