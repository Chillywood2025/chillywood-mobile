-- Harden owner-only scoped staff permission RPCs against NULL actor-role fallthrough.
-- In SQL, `NULL <> 'owner'` evaluates to NULL, not TRUE. These functions must
-- explicitly deny unaffiliated authenticated users before any owner-only grant
-- or revoke can proceed.

create or replace function public."admin_grant_platform_staff_permission_by_email"(
  p_target_email text,
  p_permission_key text,
  p_reason text default null,
  p_expires_at timestamptz default null
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
  v_permission_key text := public.platform_staff_normalize_permission_key(p_permission_key);
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_grant_id uuid;
begin
  if auth.uid() is null then
    raise exception 'platform_staff_auth_required';
  end if;

  if v_actor_role is null or v_actor_role <> 'owner' then
    perform public.platform_staff_write_permission_audit(
      v_actor_user_id,
      v_actor_email,
      coalesce(v_actor_role, 'member'),
      null,
      v_target_email,
      coalesce(v_permission_key, 'manage_moderators'),
      'blocked',
      coalesce(v_reason, 'Only Owner can grant scoped staff permissions.'),
      jsonb_build_object('blocked_reason', 'owner_required')
    );
    raise exception 'platform_staff_permission_owner_required';
  end if;

  if v_target_email is null then
    raise exception 'platform_staff_email_required';
  end if;

  if v_permission_key is null then
    raise exception 'platform_staff_permission_invalid';
  end if;

  if v_permission_key in ('manage_moderators', 'admin_grants') and not public.platform_staff_target_has_role(v_target_email, array['operator'::text]) then
    perform public.platform_staff_write_permission_audit(
      v_actor_user_id,
      v_actor_email,
      v_actor_role,
      null,
      v_target_email,
      v_permission_key,
      'blocked',
      coalesce(v_reason, 'Staff permission requires an active Admin account.'),
      jsonb_build_object('blocked_reason', 'active_admin_required')
    );
    raise exception 'platform_staff_permission_target_admin_required';
  end if;

  update public."platform_staff_permission_grants"
  set
    "target_email" = v_target_email,
    "permission_key" = v_permission_key,
    "status" = 'active',
    "reason" = v_reason,
    "granted_by" = v_actor_user_id,
    "granted_at" = timezone('utc'::text, now()),
    "expires_at" = p_expires_at,
    "revoked_by" = null,
    "revoked_at" = null,
    "updated_at" = timezone('utc'::text, now())
  where lower("target_email") = v_target_email
    and "permission_key" = v_permission_key
  returning "id" into v_grant_id;

  if v_grant_id is null then
    insert into public."platform_staff_permission_grants" (
      "target_email",
      "permission_key",
      "status",
      "reason",
      "granted_by",
      "expires_at"
    )
    values (
      v_target_email,
      v_permission_key,
      'active',
      v_reason,
      v_actor_user_id,
      p_expires_at
    )
    returning "id" into v_grant_id;
  end if;

  perform public.platform_staff_write_permission_audit(
    v_actor_user_id,
    v_actor_email,
    v_actor_role,
    null,
    v_target_email,
    v_permission_key,
    'grant',
    v_reason,
    jsonb_build_object('expires_at', p_expires_at)
  );

  return jsonb_build_object(
    'id', v_grant_id,
    'email', v_target_email,
    'permissionKey', v_permission_key,
    'status', 'active',
    'expiresAt', p_expires_at
  );
end;
$$;

create or replace function public."admin_revoke_platform_staff_permission_by_email"(
  p_target_email text,
  p_permission_key text,
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
  v_permission_key text := public.platform_staff_normalize_permission_key(p_permission_key);
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_grant_id uuid;
begin
  if auth.uid() is null then
    raise exception 'platform_staff_auth_required';
  end if;

  if v_actor_role is null or v_actor_role <> 'owner' then
    perform public.platform_staff_write_permission_audit(
      v_actor_user_id,
      v_actor_email,
      coalesce(v_actor_role, 'member'),
      null,
      v_target_email,
      coalesce(v_permission_key, 'manage_moderators'),
      'blocked',
      coalesce(v_reason, 'Only Owner can revoke scoped staff permissions.'),
      jsonb_build_object('blocked_reason', 'owner_required')
    );
    raise exception 'platform_staff_permission_owner_required';
  end if;

  if v_target_email is null then
    raise exception 'platform_staff_email_required';
  end if;

  if v_permission_key is null then
    raise exception 'platform_staff_permission_invalid';
  end if;

  update public."platform_staff_permission_grants"
  set
    "status" = 'revoked',
    "revoked_by" = v_actor_user_id,
    "revoked_at" = timezone('utc'::text, now()),
    "updated_at" = timezone('utc'::text, now()),
    "reason" = coalesce(v_reason, "reason")
  where "status" = 'active'
    and lower("target_email") = v_target_email
    and "permission_key" = v_permission_key
  returning "id" into v_grant_id;

  if v_grant_id is null then
    raise exception 'platform_staff_permission_not_found';
  end if;

  perform public.platform_staff_write_permission_audit(
    v_actor_user_id,
    v_actor_email,
    v_actor_role,
    null,
    v_target_email,
    v_permission_key,
    'revoke',
    v_reason,
    '{}'::jsonb
  );

  return jsonb_build_object(
    'id', v_grant_id,
    'email', v_target_email,
    'permissionKey', v_permission_key,
    'status', 'revoked'
  );
end;
$$;
