-- Harden platform staff role management RPCs against NULL actor-role fallthrough.
-- The original permission predicate used NOT (...) directly; in SQL, NOT NULL is
-- still NULL, so unaffiliated authenticated users could pass the guard. These
-- replacements explicitly deny NULL actor roles before evaluating permissions.

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
      coalesce(v_reason, 'Owner grants require explicit database bootstrap.'),
      jsonb_build_object('blocked_reason', 'owner_grant_not_supported')
    );
    raise exception 'platform_staff_owner_grant_not_supported';
  end if;

  if v_actor_role is null or not (
    (v_actor_role = 'owner' and v_target_role in ('operator', 'moderator'))
    or (v_actor_role = 'operator' and v_target_role = 'moderator')
  ) then
    perform public.platform_staff_write_audit(
      v_actor_user_id,
      v_actor_email,
      coalesce(v_actor_role, 'member'),
      v_target_email,
      'blocked',
      v_target_role,
      coalesce(v_reason, 'Insufficient staff-management permission.'),
      jsonb_build_object('blocked_reason', 'insufficient_role')
    );
    raise exception 'platform_staff_permission_denied';
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
    "notes" = coalesce(v_reason, 'Granted from Admin staff management.')
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
      coalesce(v_reason, 'Granted from Admin staff management.'),
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
      'display_role', case when v_target_role = 'operator' then 'admin' else v_target_role end
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
  v_active_owner_count integer;
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

  if v_actor_role is null or not (
    (v_actor_role = 'owner' and v_target_role in ('owner', 'operator', 'moderator'))
    or (v_actor_role = 'operator' and v_target_role = 'moderator')
  ) then
    perform public.platform_staff_write_audit(
      v_actor_user_id,
      v_actor_email,
      coalesce(v_actor_role, 'member'),
      v_target_email,
      'blocked',
      v_target_role,
      coalesce(v_reason, 'Insufficient staff-management permission.'),
      jsonb_build_object('blocked_reason', 'insufficient_role')
    );
    raise exception 'platform_staff_permission_denied';
  end if;

  select count(*) into v_target_active_count
  from public."platform_role_memberships"
  where "status" = 'active'
    and "role" = v_target_role
    and lower("email") = v_target_email;

  if coalesce(v_target_active_count, 0) = 0 then
    raise exception 'platform_staff_role_not_found';
  end if;

  if v_target_role = 'owner' then
    select count(*) into v_active_owner_count
    from public."platform_role_memberships"
    where "status" = 'active'
      and "role" = 'owner';

    if coalesce(v_active_owner_count, 0) <= coalesce(v_target_active_count, 0) then
      perform public.platform_staff_write_audit(
        v_actor_user_id,
        v_actor_email,
        v_actor_role,
        v_target_email,
        'blocked',
        v_target_role,
        coalesce(v_reason, 'At least one active Owner must remain.'),
        jsonb_build_object('blocked_reason', 'last_owner_protection')
      );
      raise exception 'platform_staff_last_owner_required';
    end if;
  end if;

  update public."platform_role_memberships"
  set
    "status" = 'revoked',
    "revoked_by" = v_actor_user_id,
    "revoked_at" = timezone('utc'::text, now()),
    "updated_at" = timezone('utc'::text, now()),
    "notes" = coalesce(v_reason, 'Revoked from Admin staff management.')
  where "status" = 'active'
    and "role" = v_target_role
    and lower("email") = v_target_email
  returning "id" into v_role_id;

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
      'display_role', case when v_target_role = 'operator' then 'admin' else v_target_role end
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

do $$
declare
  v_target_email text := 'role-proof-regular-blocked@example.invalid';
  v_revoked_count integer := 0;
begin
  update public."platform_role_memberships"
  set
    "status" = 'revoked',
    "revoked_by" = 'system-security-fix',
    "revoked_at" = timezone('utc'::text, now()),
    "updated_at" = timezone('utc'::text, now()),
    "notes" = 'Revoked accidental proof row created while verifying NULL actor-role guard.'
  where lower("email") = v_target_email
    and "role" = 'moderator'
    and "status" = 'active';

  get diagnostics v_revoked_count = row_count;

  if v_revoked_count > 0 then
    perform public.platform_staff_write_audit(
      'system-security-fix',
      null,
      'system',
      v_target_email,
      'revoke',
      'moderator',
      'Revoked accidental proof row after hardening staff RPC NULL actor-role guard.',
      jsonb_build_object('security_fix', 'null_actor_role_guard')
    );
  end if;
end $$;
