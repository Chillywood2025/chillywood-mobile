-- Restore the null-actor denial lost by the exact-subject function replacements.
-- A valid Auth session without effective Owner authority must not pass SQL NULL
-- predicates. Keep the current exact target checks, normal grant/revoke behavior,
-- audit contract, signatures and execute ACLs unchanged.
begin;

create or replace function public."admin_grant_platform_staff_permission_by_email"(
  p_target_email text,
  p_permission_key text,
  p_reason text default null,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text := public."platform_staff_actor_role"();
  v_actor_user_id text := auth.uid()::text;
  v_actor_email text := public."platform_staff_normalize_email"(auth.jwt() ->> 'email');
  v_target_email text := public."platform_staff_normalize_email"(p_target_email);
  v_target_user_id uuid;
  v_permission_key text := public."platform_staff_normalize_permission_key"(p_permission_key);
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_grant_id uuid;
begin
  if public."platform_exact_current_session_authority_internal"() is not true
    or v_actor_role is distinct from 'owner'
  then
    raise exception 'platform_staff_permission_owner_required';
  end if;
  if v_target_email is null then raise exception 'platform_staff_email_required'; end if;
  if v_permission_key is null then raise exception 'platform_staff_permission_invalid'; end if;
  if p_expires_at is not null
    and p_expires_at <= timezone('utc'::text, now())
  then
    raise exception 'platform_staff_permission_expiry_invalid';
  end if;

  v_target_user_id := public."platform_resolve_exact_confirmed_subject_by_email_internal"(
    v_target_email
  );

  if v_permission_key in ('manage_moderators', 'admin_grants') then
    if not public."platform_subject_has_role_internal"(
      v_target_user_id::text, array['operator'::text]
    ) then
      raise exception 'platform_staff_permission_target_admin_required';
    end if;
  elsif not public."platform_subject_has_role_internal"(
    v_target_user_id::text, array['operator'::text, 'moderator'::text]
  ) then
    raise exception 'platform_staff_permission_target_role_required';
  end if;

  if exists (
    select 1
    from public."platform_staff_permission_grants" grant_row
    where grant_row."status" = 'active'
      and grant_row."permission_key" = v_permission_key
      and lower(grant_row."target_email") = v_target_email
      and grant_row."target_user_id" is distinct from v_target_user_id::text
  ) then
    raise exception 'platform_staff_permission_subject_conflict';
  end if;

  select grant_row."id"
  into v_grant_id
  from public."platform_staff_permission_grants" grant_row
  where grant_row."status" = 'active'
    and grant_row."target_user_id" = v_target_user_id::text
    and grant_row."permission_key" = v_permission_key
  order by grant_row."granted_at" desc
  limit 1;

  if v_grant_id is null then
    insert into public."platform_staff_permission_grants" (
      "target_user_id", "target_email", "permission_key", "status",
      "reason", "granted_by", "granted_at", "expires_at",
      "revoked_by", "revoked_at", "updated_at"
    ) values (
      v_target_user_id::text, v_target_email, v_permission_key, 'active',
      v_reason, v_actor_user_id, timezone('utc'::text, now()), p_expires_at,
      null, null, timezone('utc'::text, now())
    ) returning "id" into v_grant_id;
  else
    update public."platform_staff_permission_grants"
    set "target_email" = v_target_email,
        "status" = 'active',
        "reason" = v_reason,
        "granted_by" = v_actor_user_id,
        "granted_at" = timezone('utc'::text, now()),
        "expires_at" = p_expires_at,
        "revoked_by" = null,
        "revoked_at" = null,
        "updated_at" = timezone('utc'::text, now())
    where "id" = v_grant_id;
  end if;

  perform public."platform_staff_write_permission_audit"(
    v_actor_user_id, v_actor_email, v_actor_role,
    v_target_user_id::text, v_target_email, v_permission_key,
    'grant', v_reason,
    jsonb_build_object('expires_at', p_expires_at, 'exact_subject', true)
  );

  return jsonb_build_object(
    'id', v_grant_id,
    'userId', v_target_user_id,
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
set search_path = ''
as $$
declare
  v_actor_role text := public."platform_staff_actor_role"();
  v_actor_user_id text := auth.uid()::text;
  v_actor_email text := public."platform_staff_normalize_email"(auth.jwt() ->> 'email');
  v_target_email text := public."platform_staff_normalize_email"(p_target_email);
  v_target_user_id uuid;
  v_permission_key text := public."platform_staff_normalize_permission_key"(p_permission_key);
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_grant_id uuid;
begin
  if public."platform_exact_current_session_authority_internal"() is not true
    or v_actor_role is distinct from 'owner'
  then
    raise exception 'platform_staff_permission_owner_required';
  end if;
  if v_target_email is null then raise exception 'platform_staff_email_required'; end if;
  if v_permission_key is null then raise exception 'platform_staff_permission_invalid'; end if;

  v_target_user_id := public."platform_resolve_exact_confirmed_subject_by_email_internal"(
    v_target_email
  );

  select grant_row."id"
  into v_grant_id
  from public."platform_staff_permission_grants" grant_row
  where grant_row."status" = 'active'
    and grant_row."target_user_id" = v_target_user_id::text
    and grant_row."permission_key" = v_permission_key
  order by grant_row."granted_at" desc
  limit 1;

  if v_grant_id is null then
    raise exception 'platform_staff_permission_not_found';
  end if;

  update public."platform_staff_permission_grants"
  set "status" = 'revoked',
      "revoked_by" = v_actor_user_id,
      "revoked_at" = timezone('utc'::text, now()),
      "updated_at" = timezone('utc'::text, now()),
      "reason" = coalesce(v_reason, "reason")
  where "id" = v_grant_id;

  perform public."platform_staff_write_permission_audit"(
    v_actor_user_id, v_actor_email, v_actor_role,
    v_target_user_id::text, v_target_email, v_permission_key,
    'revoke', v_reason, jsonb_build_object('exact_subject', true)
  );

  return jsonb_build_object(
    'id', v_grant_id,
    'userId', v_target_user_id,
    'email', v_target_email,
    'permissionKey', v_permission_key,
    'status', 'revoked'
  );
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
set search_path = ''
as $$
declare
  v_actor_role text := public."platform_staff_actor_role"();
  v_actor_user_id text := auth.uid()::text;
  v_actor_email text := public."platform_staff_normalize_email"(auth.jwt() ->> 'email');
  v_target_email text := public."platform_staff_normalize_email"(p_target_email);
  v_target_user_id uuid;
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
  if public."platform_exact_current_session_authority_internal"() is not true
    or v_actor_role is distinct from 'owner'
  then
    raise exception 'platform_staff_permission_owner_required';
  end if;
  if v_target_email is null then raise exception 'platform_staff_email_required'; end if;
  if v_reason is null or length(v_reason) < 6 then
    raise exception 'platform_staff_reason_required';
  end if;
  if p_expires_at is not null
    and p_expires_at <= timezone('utc'::text, now())
  then
    raise exception 'platform_staff_permission_expiry_invalid';
  end if;

  v_target_user_id := public."platform_resolve_exact_confirmed_subject_by_email_internal"(
    v_target_email
  );
  if not public."platform_subject_has_role_internal"(
    v_target_user_id::text, array['operator'::text, 'moderator'::text]
  ) then
    raise exception 'platform_staff_permission_target_staff_required';
  end if;

  select coalesce(array_agg(distinct raw_key order by raw_key), array[]::text[])
  into v_invalid_keys
  from (
    select nullif(trim(coalesce(raw_entry, '')), '') as raw_key,
           public."platform_staff_normalize_permission_key"(raw_entry) as normalized_key
    from unnest(coalesce(p_permission_keys, array[]::text[])) raw_entry
  ) normalized
  where raw_key is not null and normalized_key is null;
  if cardinality(v_invalid_keys) > 0 then
    raise exception 'platform_staff_permission_invalid';
  end if;

  select coalesce(array_agg(distinct normalized_key order by normalized_key), array[]::text[])
  into v_requested_permissions
  from (
    select public."platform_staff_normalize_permission_key"(raw_entry) as normalized_key
    from unnest(coalesce(p_permission_keys, array[]::text[])) raw_entry
  ) normalized
  where normalized_key is not null;

  if (
    ('admin_grants' = any(v_requested_permissions)
      or 'manage_moderators' = any(v_requested_permissions))
    and not public."platform_subject_has_role_internal"(
      v_target_user_id::text, array['operator'::text]
    )
  ) then
    raise exception 'platform_staff_permission_target_admin_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'platform-staff-permission:' || v_target_user_id::text,
      0
    )
  );

  if exists (
    select 1
    from public."platform_staff_permission_grants" grant_row
    where grant_row."status" = 'active'
      and lower(trim(coalesce(grant_row."target_email", ''))) = v_target_email
      and grant_row."target_user_id" is distinct from v_target_user_id::text
  ) then
    raise exception 'platform_staff_permission_subject_conflict';
  end if;

  select coalesce(array_agg(distinct grant_row."permission_key"
    order by grant_row."permission_key"), array[]::text[])
  into v_old_permissions
  from public."platform_staff_permission_grants" grant_row
  where grant_row."status" = 'active'
    and grant_row."target_user_id" = v_target_user_id::text
    and (grant_row."expires_at" is null
      or grant_row."expires_at" > timezone('utc'::text, now()));

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
  set "status" = 'revoked',
      "revoked_by" = v_actor_user_id,
      "revoked_at" = timezone('utc'::text, now()),
      "updated_at" = timezone('utc'::text, now()),
      "reason" = v_reason,
      "metadata" = coalesce("metadata", '{}'::jsonb)
        || jsonb_build_object('bulk_update', true, 'exact_subject', true)
  where "status" = 'active'
    and "target_user_id" = v_target_user_id::text
    and not ("permission_key" = any(v_requested_permissions));

  foreach v_permission_key in array v_requested_permissions loop
    select grant_row."id"
    into v_grant_id
    from public."platform_staff_permission_grants" grant_row
    where grant_row."status" = 'active'
      and grant_row."target_user_id" = v_target_user_id::text
      and grant_row."permission_key" = v_permission_key
    order by grant_row."granted_at" desc, grant_row."id" desc
    limit 1;

    if v_grant_id is null then
      insert into public."platform_staff_permission_grants" (
        "target_user_id", "target_email", "permission_key", "status",
        "reason", "granted_by", "granted_at", "expires_at",
        "revoked_by", "revoked_at", "updated_at", "metadata"
      ) values (
        v_target_user_id::text, v_target_email, v_permission_key, 'active',
        v_reason, v_actor_user_id, timezone('utc'::text, now()), p_expires_at,
        null, null, timezone('utc'::text, now()),
        jsonb_build_object('bulk_update', true, 'exact_subject', true)
      ) returning "id" into v_grant_id;
    else
      update public."platform_staff_permission_grants"
      set "target_user_id" = v_target_user_id::text,
          "target_email" = v_target_email,
          "status" = 'active',
          "reason" = v_reason,
          "granted_by" = v_actor_user_id,
          "granted_at" = timezone('utc'::text, now()),
          "expires_at" = p_expires_at,
          "revoked_by" = null,
          "revoked_at" = null,
          "updated_at" = timezone('utc'::text, now()),
          "metadata" = coalesce("metadata", '{}'::jsonb)
            || jsonb_build_object('bulk_update', true, 'exact_subject', true)
      where "id" = v_grant_id;

      update public."platform_staff_permission_grants"
      set "status" = 'revoked',
          "revoked_by" = v_actor_user_id,
          "revoked_at" = timezone('utc'::text, now()),
          "updated_at" = timezone('utc'::text, now()),
          "reason" = v_reason
      where "status" = 'active'
        and "target_user_id" = v_target_user_id::text
        and "permission_key" = v_permission_key
        and "id" <> v_grant_id;
    end if;
  end loop;

  foreach v_permission_key in array v_granted_permissions loop
    perform public."platform_staff_write_permission_audit"(
      v_actor_user_id, v_actor_email, v_actor_role,
      v_target_user_id::text, v_target_email, v_permission_key,
      'grant', v_reason,
      jsonb_build_object('bulk_update', true, 'exact_subject', true,
        'old_permissions', v_old_permissions,
        'new_permissions', v_requested_permissions,
        'expires_at', p_expires_at)
    );
  end loop;
  foreach v_permission_key in array v_revoked_permissions loop
    perform public."platform_staff_write_permission_audit"(
      v_actor_user_id, v_actor_email, v_actor_role,
      v_target_user_id::text, v_target_email, v_permission_key,
      'revoke', v_reason,
      jsonb_build_object('bulk_update', true, 'exact_subject', true,
        'old_permissions', v_old_permissions,
        'new_permissions', v_requested_permissions)
    );
  end loop;

  return jsonb_build_object(
    'userId', v_target_user_id,
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

commit;
