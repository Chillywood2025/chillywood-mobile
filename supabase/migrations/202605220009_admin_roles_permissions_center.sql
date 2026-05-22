-- Admin Roles & Permissions production pass.
-- Adds an audited full-set scoped-permission save path and role audit feed
-- without widening normal-user staff visibility or exposing service secrets.

create or replace function public."platform_staff_write_permission_audit"(
  p_actor_user_id text,
  p_actor_email text,
  p_actor_role text,
  p_target_user_id text,
  p_target_email text,
  p_permission_key text,
  p_action text,
  p_reason text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_permission_key text := public.platform_staff_normalize_permission_key(p_permission_key);
  v_actor_role text := coalesce(nullif(trim(coalesce(p_actor_role, '')), ''), 'member');
  v_break_glass_session_id uuid := public.platform_current_break_glass_session_id(p_actor_user_id, p_actor_email);
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'break_glass_active', v_break_glass_session_id is not null,
      'break_glass_session_id', v_break_glass_session_id
    );
begin
  if v_permission_key is null then
    raise exception 'platform_staff_permission_invalid';
  end if;

  if p_action in ('grant', 'revoke', 'template_apply', 'template_revoke')
    and length(trim(coalesce(p_reason, ''))) < 6 then
    raise exception 'platform_staff_reason_required';
  end if;

  insert into public."platform_staff_permission_audit" (
    "actor_user_id",
    "actor_email",
    "actor_role",
    "target_user_id",
    "target_email",
    "permission_key",
    "action",
    "reason",
    "metadata"
  )
  values (
    nullif(trim(coalesce(p_actor_user_id, '')), ''),
    public.platform_staff_normalize_email(p_actor_email),
    v_actor_role,
    nullif(trim(coalesce(p_target_user_id, '')), ''),
    public.platform_staff_normalize_email(p_target_email),
    v_permission_key,
    p_action,
    nullif(trim(coalesce(p_reason, '')), ''),
    v_metadata
  );

  if to_regclass('public.platform_admin_audit_logs') is not null then
    insert into public."platform_admin_audit_logs" (
      "actor_user_id",
      "actor_email",
      "actor_role",
      "action",
      "action_category",
      "target_type",
      "target_id",
      "reason",
      "severity",
      "metadata"
    )
    values (
      nullif(trim(coalesce(p_actor_user_id, '')), ''),
      public.platform_staff_normalize_email(p_actor_email),
      v_actor_role,
      concat('platform_staff_permission_', p_action),
      'role',
      'platform_staff_permission',
      concat(public.platform_staff_normalize_email(p_target_email), ':', v_permission_key),
      nullif(trim(coalesce(p_reason, '')), ''),
      case when p_action = 'blocked' then 'warning' else 'notice' end,
      v_metadata
    );
  end if;
end;
$$;

create or replace function public."platform_staff_write_audit"(
  p_actor_user_id text,
  p_actor_email text,
  p_actor_role text,
  p_target_email text,
  p_action text,
  p_role text,
  p_reason text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text := coalesce(nullif(trim(coalesce(p_actor_role, '')), ''), 'member');
  v_break_glass_session_id uuid := public.platform_current_break_glass_session_id(p_actor_user_id, p_actor_email);
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'break_glass_active', v_break_glass_session_id is not null,
      'break_glass_session_id', v_break_glass_session_id
    );
begin
  if p_action in ('grant', 'revoke')
    and length(trim(coalesce(p_reason, ''))) < 6 then
    raise exception 'platform_staff_reason_required';
  end if;

  insert into public."platform_staff_role_audit" (
    "actor_user_id",
    "actor_email",
    "actor_role",
    "target_email",
    "action",
    "role",
    "reason",
    "metadata"
  )
  values (
    nullif(trim(coalesce(p_actor_user_id, '')), ''),
    public.platform_staff_normalize_email(p_actor_email),
    v_actor_role,
    public.platform_staff_normalize_email(p_target_email),
    p_action,
    public.platform_staff_normalize_role(p_role),
    nullif(trim(coalesce(p_reason, '')), ''),
    v_metadata
  );

  if to_regclass('public.platform_admin_audit_logs') is not null then
    insert into public."platform_admin_audit_logs" (
      "actor_user_id",
      "actor_email",
      "actor_role",
      "action",
      "action_category",
      "target_type",
      "target_id",
      "reason",
      "severity",
      "metadata"
    )
    values (
      nullif(trim(coalesce(p_actor_user_id, '')), ''),
      public.platform_staff_normalize_email(p_actor_email),
      v_actor_role,
      concat('platform_staff_role_', p_action),
      'role',
      'platform_role_membership',
      concat(public.platform_staff_normalize_email(p_target_email), ':', public.platform_staff_normalize_role(p_role)),
      nullif(trim(coalesce(p_reason, '')), ''),
      case when p_action = 'blocked' then 'warning' else 'notice' end,
      v_metadata
    );
  end if;
end;
$$;

create or replace function public."list_staff_scoped_permissions_by_email"(
  p_target_email text
)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor_role text := public.platform_staff_actor_role();
  v_actor_email text := public.platform_staff_normalize_email(auth.jwt() ->> 'email');
  v_target_email text := public.platform_staff_normalize_email(p_target_email);
  v_permissions text[];
begin
  if auth.uid() is null then
    raise exception 'platform_staff_auth_required';
  end if;

  if v_target_email is null then
    raise exception 'platform_staff_email_required';
  end if;

  if v_actor_role <> 'owner' and v_target_email <> v_actor_email then
    raise exception 'platform_staff_permission_owner_required';
  end if;

  select coalesce(array_agg(distinct grant_row."permission_key" order by grant_row."permission_key"), array[]::text[])
  into v_permissions
  from public."platform_staff_permission_grants" grant_row
  where grant_row."status" = 'active'
    and lower(grant_row."target_email") = v_target_email
    and (
      grant_row."expires_at" is null
      or grant_row."expires_at" > timezone('utc'::text, now())
    );

  return coalesce(v_permissions, array[]::text[]);
end;
$$;

create or replace function public."admin_update_platform_staff_permissions_by_email"(
  p_target_email text,
  p_permission_keys text[],
  p_reason text,
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
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_old_permissions text[] := array[]::text[];
  v_requested_permissions text[] := array[]::text[];
  v_granted_permissions text[] := array[]::text[];
  v_revoked_permissions text[] := array[]::text[];
  v_unchanged_permissions text[] := array[]::text[];
  v_invalid_keys text[] := array[]::text[];
  v_permission_key text;
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
      'manage_moderators',
      'blocked',
      coalesce(v_reason, 'Only Owner can update scoped staff permissions.'),
      jsonb_build_object('blocked_reason', 'owner_required', 'bulk_update', true)
    );
    raise exception 'platform_staff_permission_owner_required';
  end if;

  if v_target_email is null then
    raise exception 'platform_staff_email_required';
  end if;

  if v_reason is null or length(v_reason) < 6 then
    raise exception 'platform_staff_reason_required';
  end if;

  select coalesce(array_agg(distinct raw_key order by raw_key), array[]::text[])
  into v_invalid_keys
  from (
    select nullif(trim(coalesce(raw_entry, '')), '') as raw_key,
           public.platform_staff_normalize_permission_key(raw_entry) as normalized_key
    from unnest(coalesce(p_permission_keys, array[]::text[])) raw_entry
  ) normalized
  where raw_key is not null
    and normalized_key is null;

  if cardinality(v_invalid_keys) > 0 then
    raise exception 'platform_staff_permission_invalid';
  end if;

  select coalesce(array_agg(distinct normalized_key order by normalized_key), array[]::text[])
  into v_requested_permissions
  from (
    select public.platform_staff_normalize_permission_key(raw_entry) as normalized_key
    from unnest(coalesce(p_permission_keys, array[]::text[])) raw_entry
  ) normalized
  where normalized_key is not null;

  if not public.platform_staff_target_has_role(v_target_email, array['operator'::text, 'moderator'::text]) then
    perform public.platform_staff_write_permission_audit(
      v_actor_user_id,
      v_actor_email,
      v_actor_role,
      null,
      v_target_email,
      coalesce(v_requested_permissions[1], 'manage_moderators'),
      'blocked',
      v_reason,
      jsonb_build_object('blocked_reason', 'active_staff_required', 'bulk_update', true)
    );
    raise exception 'platform_staff_permission_target_staff_required';
  end if;

  if (
    ('admin_grants' = any(v_requested_permissions) or 'manage_moderators' = any(v_requested_permissions))
    and not public.platform_staff_target_has_role(v_target_email, array['operator'::text])
  ) then
    perform public.platform_staff_write_permission_audit(
      v_actor_user_id,
      v_actor_email,
      v_actor_role,
      null,
      v_target_email,
      case when 'admin_grants' = any(v_requested_permissions) then 'admin_grants' else 'manage_moderators' end,
      'blocked',
      v_reason,
      jsonb_build_object('blocked_reason', 'active_admin_required', 'bulk_update', true)
    );
    raise exception 'platform_staff_permission_target_admin_required';
  end if;

  select coalesce(array_agg(distinct grant_row."permission_key" order by grant_row."permission_key"), array[]::text[])
  into v_old_permissions
  from public."platform_staff_permission_grants" grant_row
  where grant_row."status" = 'active'
    and lower(grant_row."target_email") = v_target_email
    and (
      grant_row."expires_at" is null
      or grant_row."expires_at" > timezone('utc'::text, now())
    );

  select coalesce(array_agg(permission_key order by permission_key), array[]::text[])
  into v_granted_permissions
  from unnest(v_requested_permissions) permission_key
  where not (permission_key = any(v_old_permissions));

  select coalesce(array_agg(permission_key order by permission_key), array[]::text[])
  into v_revoked_permissions
  from unnest(v_old_permissions) permission_key
  where not (permission_key = any(v_requested_permissions));

  select coalesce(array_agg(permission_key order by permission_key), array[]::text[])
  into v_unchanged_permissions
  from unnest(v_requested_permissions) permission_key
  where permission_key = any(v_old_permissions);

  update public."platform_staff_permission_grants"
  set
    "status" = 'revoked',
    "revoked_by" = v_actor_user_id,
    "revoked_at" = timezone('utc'::text, now()),
    "updated_at" = timezone('utc'::text, now()),
    "reason" = v_reason,
    "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object('bulk_update', true)
  where "status" = 'active'
    and lower("target_email") = v_target_email
    and not ("permission_key" = any(v_requested_permissions));

  foreach v_permission_key in array v_requested_permissions loop
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
      "updated_at" = timezone('utc'::text, now()),
      "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object('bulk_update', true)
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
        "expires_at",
        "metadata"
      )
      values (
        v_target_email,
        v_permission_key,
        'active',
        v_reason,
        v_actor_user_id,
        p_expires_at,
        jsonb_build_object('bulk_update', true)
      )
      returning "id" into v_grant_id;
    end if;
  end loop;

  foreach v_permission_key in array v_granted_permissions loop
    perform public.platform_staff_write_permission_audit(
      v_actor_user_id,
      v_actor_email,
      v_actor_role,
      null,
      v_target_email,
      v_permission_key,
      'grant',
      v_reason,
      jsonb_build_object(
        'bulk_update', true,
        'old_permissions', v_old_permissions,
        'new_permissions', v_requested_permissions,
        'expires_at', p_expires_at
      )
    );
  end loop;

  foreach v_permission_key in array v_revoked_permissions loop
    perform public.platform_staff_write_permission_audit(
      v_actor_user_id,
      v_actor_email,
      v_actor_role,
      null,
      v_target_email,
      v_permission_key,
      'revoke',
      v_reason,
      jsonb_build_object(
        'bulk_update', true,
        'old_permissions', v_old_permissions,
        'new_permissions', v_requested_permissions
      )
    );
  end loop;

  if to_regclass('public.platform_admin_audit_logs') is not null then
    insert into public."platform_admin_audit_logs" (
      "actor_user_id",
      "actor_email",
      "actor_role",
      "action",
      "action_category",
      "target_type",
      "target_id",
      "reason",
      "severity",
      "metadata"
    )
    values (
      v_actor_user_id,
      v_actor_email,
      v_actor_role,
      'platform_staff_permission_bulk_update',
      'role',
      'platform_staff_permission_set',
      v_target_email,
      v_reason,
      'notice',
      jsonb_build_object(
        'old_permissions', v_old_permissions,
        'new_permissions', v_requested_permissions,
        'granted_permissions', v_granted_permissions,
        'revoked_permissions', v_revoked_permissions,
        'unchanged_permissions', v_unchanged_permissions,
        'expires_at', p_expires_at
      )
    );
  end if;

  return jsonb_build_object(
    'email', v_target_email,
    'oldPermissions', v_old_permissions,
    'newPermissions', v_requested_permissions,
    'grantedPermissions', v_granted_permissions,
    'revokedPermissions', v_revoked_permissions,
    'unchangedPermissions', v_unchanged_permissions,
    'auditWritten', true,
    'updatedAt', timezone('utc'::text, now())
  );
end;
$$;

create or replace function public."list_admin_role_audit_events"(
  p_filter text default 'all',
  p_limit integer default 20
)
returns table (
  id text,
  audit_kind text,
  action text,
  role text,
  permission_key text,
  actor_email text,
  actor_role text,
  actor_user_id text,
  target_email text,
  target_user_id text,
  reason text,
  created_at timestamptz,
  metadata jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_filter text := lower(trim(coalesce(p_filter, 'all')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
begin
  if auth.uid() is null then
    raise exception 'platform_staff_auth_required';
  end if;

  if not (
    public.has_platform_role(array['owner'::text])
    or public.has_platform_permission('admin_grants')
    or public.has_platform_permission('manage_moderators')
  ) then
    raise exception 'platform_staff_permission_denied';
  end if;

  return query
  with unified as (
    select
      role_audit."id"::text as id,
      'role'::text as audit_kind,
      role_audit."action" as action,
      role_audit."role" as role,
      null::text as permission_key,
      role_audit."actor_email" as actor_email,
      role_audit."actor_role" as actor_role,
      role_audit."actor_user_id" as actor_user_id,
      role_audit."target_email" as target_email,
      role_audit."target_user_id" as target_user_id,
      role_audit."reason" as reason,
      role_audit."created_at" as created_at,
      role_audit."metadata" as metadata
    from public."platform_staff_role_audit" role_audit
    union all
    select
      permission_audit."id"::text as id,
      'permission'::text as audit_kind,
      permission_audit."action" as action,
      null::text as role,
      permission_audit."permission_key" as permission_key,
      permission_audit."actor_email" as actor_email,
      permission_audit."actor_role" as actor_role,
      permission_audit."actor_user_id" as actor_user_id,
      permission_audit."target_email" as target_email,
      permission_audit."target_user_id" as target_user_id,
      permission_audit."reason" as reason,
      permission_audit."created_at" as created_at,
      permission_audit."metadata" as metadata
    from public."platform_staff_permission_audit" permission_audit
  )
  select
    unified.id,
    unified.audit_kind,
    unified.action,
    unified.role,
    unified.permission_key,
    unified.actor_email,
    unified.actor_role,
    unified.actor_user_id,
    unified.target_email,
    unified.target_user_id,
    unified.reason,
    unified.created_at,
    unified.metadata
  from unified
  where
    v_filter = 'all'
    or (v_filter = 'grants' and unified.action in ('grant', 'bootstrap', 'template_apply'))
    or (v_filter = 'revokes' and unified.action in ('revoke', 'template_revoke', 'expire'))
    or (v_filter = 'permissions' and unified.audit_kind = 'permission')
    or (v_filter = 'owners' and unified.role = 'owner')
    or (v_filter = 'admins' and unified.role = 'operator')
    or (v_filter = 'moderators' and unified.role = 'moderator')
  order by unified.created_at desc
  limit v_limit;
end;
$$;

revoke all on function public."list_staff_scoped_permissions_by_email"(text) from public;
revoke all on function public."admin_update_platform_staff_permissions_by_email"(text, text[], text, timestamptz) from public;
revoke all on function public."list_admin_role_audit_events"(text, integer) from public;
grant execute on function public."list_staff_scoped_permissions_by_email"(text) to authenticated;
grant execute on function public."admin_update_platform_staff_permissions_by_email"(text, text[], text, timestamptz) to authenticated;
grant execute on function public."list_admin_role_audit_events"(text, integer) to authenticated;

comment on function public."admin_update_platform_staff_permissions_by_email"(text, text[], text, timestamptz) is
  'Owner-only atomic scoped staff permission set update. Validates known permission keys, requires reason, and writes permission/admin audit rows for every delta.';
comment on function public."list_admin_role_audit_events"(text, integer) is
  'Safe owner/scoped-staff role-audit feed for the Admin Roles & Permissions dashboard.';
