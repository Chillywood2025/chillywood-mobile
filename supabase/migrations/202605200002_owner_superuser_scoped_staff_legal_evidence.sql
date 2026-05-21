-- Owner invisible superuser, scoped staff permissions, and legal evidence foundation.
-- This migration keeps the existing Staff & Roles UI/RPC entrypoints while
-- replacing broad operator moderator-management authority with owner-granted
-- scoped permissions.

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
    when 'evidence_export' then 'evidence_export'
    when 'emergency_break_glass' then 'emergency_break_glass'
    when 'admin_grants' then 'admin_grants'
    when 'manage_moderators' then 'manage_moderators'
    when 'moderator_grants' then 'manage_moderators'
    else null
  end;
$$;

create table if not exists public."platform_staff_permission_grants" (
  "id" uuid default gen_random_uuid() not null,
  "target_user_id" text,
  "target_email" text not null,
  "permission_key" text not null,
  "status" text default 'active'::text not null,
  "reason" text,
  "metadata" jsonb default '{}'::jsonb not null,
  "granted_by" text,
  "granted_at" timestamptz default timezone('utc'::text, now()) not null,
  "expires_at" timestamptz,
  "revoked_by" text,
  "revoked_at" timestamptz,
  "updated_at" timestamptz default timezone('utc'::text, now()) not null,
  constraint "platform_staff_permission_grants_pkey" primary key ("id"),
  constraint "platform_staff_permission_grants_email_check"
    check (length(trim("target_email")) > 0),
  constraint "platform_staff_permission_grants_permission_check"
    check ("permission_key" in (
      'support_inbox',
      'user_lookup',
      'content_moderation',
      'reports_review',
      'live_ops',
      'billing_support_read',
      'creator_support',
      'legal_review',
      'evidence_export',
      'emergency_break_glass',
      'admin_grants',
      'manage_moderators'
    )),
  constraint "platform_staff_permission_grants_status_check"
    check ("status" in ('active', 'revoked'))
);

create unique index if not exists "platform_staff_permission_grants_active_email_key_uidx"
  on public."platform_staff_permission_grants" (lower("target_email"), "permission_key")
  where "status" = 'active';

create index if not exists "platform_staff_permission_grants_target_user_idx"
  on public."platform_staff_permission_grants" ("target_user_id", "status", "permission_key")
  where "target_user_id" is not null;

create index if not exists "platform_staff_permission_grants_target_email_idx"
  on public."platform_staff_permission_grants" (lower("target_email"), "status", "permission_key");

alter table public."platform_staff_permission_grants" enable row level security;

drop policy if exists "platform_staff_permission_grants_select_owner_or_self"
  on public."platform_staff_permission_grants";
create policy "platform_staff_permission_grants_select_owner_or_self"
  on public."platform_staff_permission_grants"
  for select
  to authenticated
  using (
    public.has_platform_role(array['owner'::text])
    or (
      auth.uid() is not null
      and (
        "target_user_id" = auth.uid()::text
        or lower("target_email") = public.platform_staff_normalize_email(auth.jwt() ->> 'email')
      )
    )
  );

revoke all on table public."platform_staff_permission_grants" from "anon";
revoke all on table public."platform_staff_permission_grants" from "authenticated";
grant select on table public."platform_staff_permission_grants" to "authenticated";
grant all on table public."platform_staff_permission_grants" to "service_role";

create table if not exists public."platform_staff_permission_audit" (
  "id" uuid default gen_random_uuid() not null,
  "actor_user_id" text,
  "actor_email" text,
  "actor_role" text,
  "target_user_id" text,
  "target_email" text,
  "permission_key" text not null,
  "action" text not null,
  "reason" text,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamptz default timezone('utc'::text, now()) not null,
  constraint "platform_staff_permission_audit_pkey" primary key ("id"),
  constraint "platform_staff_permission_audit_action_check"
    check ("action" in ('grant', 'revoke', 'blocked')),
  constraint "platform_staff_permission_audit_permission_check"
    check ("permission_key" in (
      'support_inbox',
      'user_lookup',
      'content_moderation',
      'reports_review',
      'live_ops',
      'billing_support_read',
      'creator_support',
      'legal_review',
      'evidence_export',
      'emergency_break_glass',
      'admin_grants',
      'manage_moderators'
    ))
);

create index if not exists "platform_staff_permission_audit_created_at_idx"
  on public."platform_staff_permission_audit" ("created_at" desc);

create index if not exists "platform_staff_permission_audit_target_email_idx"
  on public."platform_staff_permission_audit" (lower("target_email"), "created_at" desc)
  where "target_email" is not null;

alter table public."platform_staff_permission_audit" enable row level security;

drop policy if exists "platform_staff_permission_audit_select_owner"
  on public."platform_staff_permission_audit";
create policy "platform_staff_permission_audit_select_owner"
  on public."platform_staff_permission_audit"
  for select
  to authenticated
  using (public.has_platform_role(array['owner'::text]));

revoke all on table public."platform_staff_permission_audit" from "anon";
revoke all on table public."platform_staff_permission_audit" from "authenticated";
grant select on table public."platform_staff_permission_audit" to "authenticated";
grant all on table public."platform_staff_permission_audit" to "service_role";

create or replace function public."platform_staff_permission_prevent_mutation"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'platform_staff_permission_audit_append_only';
end;
$$;

drop trigger if exists "platform_staff_permission_audit_no_update" on public."platform_staff_permission_audit";
create trigger "platform_staff_permission_audit_no_update"
  before update or delete on public."platform_staff_permission_audit"
  for each row execute function public."platform_staff_permission_prevent_mutation"();

create or replace function public."platform_staff_target_has_role"(
  p_target_email text,
  p_allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public."platform_role_memberships" membership
    where membership."status" = 'active'
      and membership."role" = any(p_allowed_roles)
      and lower(membership."email") = public.platform_staff_normalize_email(p_target_email)
    limit 1
  );
$$;

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
begin
  if v_permission_key is null then
    raise exception 'platform_staff_permission_invalid';
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
    nullif(trim(coalesce(p_actor_role, '')), ''),
    nullif(trim(coalesce(p_target_user_id, '')), ''),
    public.platform_staff_normalize_email(p_target_email),
    v_permission_key,
    p_action,
    nullif(trim(coalesce(p_reason, '')), ''),
    coalesce(p_metadata, '{}'::jsonb)
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
      nullif(trim(coalesce(p_actor_role, '')), ''),
      concat('platform_staff_permission_', p_action),
      'role',
      'platform_staff_permission',
      concat(public.platform_staff_normalize_email(p_target_email), ':', v_permission_key),
      nullif(trim(coalesce(p_reason, '')), ''),
      case when p_action = 'blocked' then 'warning' else 'notice' end,
      coalesce(p_metadata, '{}'::jsonb)
    );
  end if;
end;
$$;

create or replace function public."has_platform_permission"(p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with normalized as (
    select public.platform_staff_normalize_permission_key(p_permission_key) as permission_key,
           public.platform_staff_normalize_email(auth.jwt() ->> 'email') as actor_email,
           auth.uid()::text as actor_user_id
  )
  select
    public.has_platform_role(array['owner'::text])
    or (
      (select permission_key from normalized) is not null
      and auth.uid() is not null
      and exists (
        select 1
        from public."platform_role_memberships" staff_role
        join normalized on true
        where staff_role."status" = 'active'
          and staff_role."role" in ('operator', 'moderator')
          and (
            staff_role."user_id" = normalized.actor_user_id
            or lower(staff_role."email") = normalized.actor_email
          )
        limit 1
      )
      and exists (
        select 1
        from public."platform_staff_permission_grants" grant_row
        join normalized on true
        where grant_row."status" = 'active'
          and grant_row."permission_key" = normalized.permission_key
          and (
            grant_row."target_user_id" = normalized.actor_user_id
            or lower(grant_row."target_email") = normalized.actor_email
          )
          and (
            grant_row."expires_at" is null
            or grant_row."expires_at" > timezone('utc'::text, now())
          )
        limit 1
      )
    );
$$;

drop policy if exists "platform_staff_role_audit_select_owner_operator"
  on public."platform_staff_role_audit";
create policy "platform_staff_role_audit_select_owner_or_scoped_staff"
  on public."platform_staff_role_audit"
  for select
  to authenticated
  using (
    public.has_platform_role(array['owner'::text])
    or public.has_platform_permission('admin_grants')
    or public.has_platform_permission('manage_moderators')
  );

drop policy if exists "platform_admin_audit_logs_select_owner_operator"
  on public."platform_admin_audit_logs";
create policy "platform_admin_audit_logs_select_owner_or_scoped_staff"
  on public."platform_admin_audit_logs"
  for select
  to authenticated
  using (
    public.has_platform_role(array['owner'::text])
    or public.has_platform_permission('admin_grants')
    or public.has_platform_permission('manage_moderators')
    or public.has_platform_permission('content_moderation')
    or public.has_platform_permission('reports_review')
    or public.has_platform_permission('live_ops')
    or public.has_platform_permission('legal_review')
    or public.has_platform_permission('evidence_export')
    or public.has_platform_permission('emergency_break_glass')
  );

drop policy if exists "platform_admin_audit_logs_insert_owner_operator"
  on public."platform_admin_audit_logs";
revoke insert, update, delete on table public."platform_admin_audit_logs" from "authenticated";
grant select on table public."platform_admin_audit_logs" to "authenticated";
grant all on table public."platform_admin_audit_logs" to "service_role";

create or replace function public."read_my_platform_staff_permission_keys"()
returns text[]
language sql
stable
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
      ('evidence_export'::text),
      ('emergency_break_glass'::text),
      ('admin_grants'::text),
      ('manage_moderators'::text)
  ),
  actor as (
    select auth.uid()::text as user_id,
           public.platform_staff_normalize_email(auth.jwt() ->> 'email') as email
  )
  select case
    when public.has_platform_role(array['owner'::text]) then array(select permission_key from known order by permission_key)
    when auth.uid() is null then array[]::text[]
    else coalesce(array(
      select distinct grant_row."permission_key"
      from public."platform_staff_permission_grants" grant_row
      join actor on true
      where grant_row."status" = 'active'
        and (
          grant_row."target_user_id" = actor.user_id
          or lower(grant_row."target_email") = actor.email
        )
        and (
          grant_row."expires_at" is null
          or grant_row."expires_at" > timezone('utc'::text, now())
        )
      order by grant_row."permission_key"
    ), array[]::text[])
  end;
$$;

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

  if v_actor_role <> 'owner' then
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

  if v_actor_role <> 'owner' then
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

  if v_actor_role <> 'owner' and v_target_email = v_actor_email then
    perform public.platform_staff_write_audit(
      v_actor_user_id,
      v_actor_email,
      coalesce(v_actor_role, 'member'),
      v_target_email,
      'blocked',
      v_target_role,
      coalesce(v_reason, 'Admins cannot grant staff roles to themselves.'),
      jsonb_build_object('blocked_reason', 'self_grant_blocked')
    );
    raise exception 'platform_staff_self_grant_denied';
  end if;

  if v_actor_role is null or not (
    (v_actor_role = 'owner' and v_target_role in ('operator', 'moderator'))
    or (v_target_role = 'operator' and public.has_platform_permission('admin_grants'))
    or (v_target_role = 'moderator' and public.has_platform_permission('manage_moderators'))
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
      'display_role', case when v_target_role = 'operator' then 'admin' else v_target_role end,
      'permission_model', 'scoped'
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
    or (v_target_role = 'operator' and public.has_platform_permission('admin_grants'))
    or (v_target_role = 'moderator' and public.has_platform_permission('manage_moderators'))
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

  if v_target_role = 'operator' then
    update public."platform_staff_permission_grants"
    set
      "status" = 'revoked',
      "revoked_by" = v_actor_user_id,
      "revoked_at" = timezone('utc'::text, now()),
      "updated_at" = timezone('utc'::text, now()),
      "reason" = coalesce(v_reason, 'Admin role revoked; scoped permissions revoked.')
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
      'permission_model', 'scoped'
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

revoke all on function public."platform_staff_normalize_permission_key"(text) from public;
revoke all on function public."platform_staff_target_has_role"(text, text[]) from public;
revoke all on function public."platform_staff_write_permission_audit"(text, text, text, text, text, text, text, text, jsonb) from public;
revoke all on function public."admin_grant_platform_staff_permission_by_email"(text, text, text, timestamptz) from public;
revoke all on function public."admin_revoke_platform_staff_permission_by_email"(text, text, text) from public;
revoke all on function public."has_platform_permission"(text) from public;
revoke all on function public."read_my_platform_staff_permission_keys"() from public;

grant execute on function public."admin_grant_platform_staff_permission_by_email"(text, text, text, timestamptz) to authenticated;
grant execute on function public."admin_revoke_platform_staff_permission_by_email"(text, text, text) to authenticated;
grant execute on function public."has_platform_permission"(text) to authenticated;
grant execute on function public."read_my_platform_staff_permission_keys"() to authenticated;
grant execute on function public."has_platform_permission"(text) to service_role;
grant execute on function public."read_my_platform_staff_permission_keys"() to service_role;

create or replace function public."is_platform_owner_user"(target_user_id text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  with normalized as (
    select nullif(trim(coalesce(target_user_id, '')), '') as user_id
  )
  select
    (select user_id from normalized) is not null
    and exists (
      select 1
      from public."platform_role_memberships" membership
      left join auth.users auth_user
        on lower(auth_user.email) = lower(membership."email")
      where membership."status" = 'active'
        and membership."role" = 'owner'
        and (
          membership."user_id" = (select user_id from normalized)
          or auth_user.id::text = (select user_id from normalized)
        )
      limit 1
    );
$$;

create or replace function public."is_current_platform_owner"()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_platform_role(array['owner'::text]);
$$;

revoke all on function public."is_platform_owner_user"(text) from public;
revoke all on function public."is_current_platform_owner"() from public;
grant execute on function public."is_platform_owner_user"(text) to anon;
grant execute on function public."is_platform_owner_user"(text) to authenticated;
grant execute on function public."is_platform_owner_user"(text) to service_role;
grant execute on function public."is_current_platform_owner"() to authenticated;
grant execute on function public."is_current_platform_owner"() to service_role;

create or replace function public.can_view_profile_content(profile_user_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actor_user_id text := (auth.uid())::text;
  owner_user_id text := nullif(btrim(coalesce(profile_user_id, '')), '');
  owner_profile_visibility text := 'everyone';
  pair_low_id text;
  pair_high_id text;
begin
  if owner_user_id is null then
    return false;
  end if;

  if actor_user_id is not null and actor_user_id = owner_user_id then
    return true;
  end if;

  if public.is_platform_owner_user(owner_user_id) then
    return false;
  end if;

  if actor_user_id is not null and exists (
    select 1
    from public."channel_audience_blocks"
    where (
      "channel_user_id" = actor_user_id
      and "blocked_user_id" = owner_user_id
    ) or (
      "channel_user_id" = owner_user_id
      and "blocked_user_id" = actor_user_id
    )
    limit 1
  ) then
    return false;
  end if;

  select coalesce(nullif("profile_visibility", ''), 'everyone'::text)
  into owner_profile_visibility
  from public."user_profiles"
  where "user_id" = owner_user_id
  limit 1;

  owner_profile_visibility := coalesce(owner_profile_visibility, 'everyone'::text);

  if owner_profile_visibility = 'everyone'::text then
    return true;
  end if;

  if actor_user_id is null or owner_profile_visibility = 'private'::text then
    return false;
  end if;

  pair_low_id := least(actor_user_id, owner_user_id);
  pair_high_id := greatest(actor_user_id, owner_user_id);

  return exists (
    select 1
    from public."user_friendships"
    where "user_low_id" = pair_low_id
      and "user_high_id" = pair_high_id
      and "status" = 'active'::text
    limit 1
  );
end;
$$;

drop policy if exists "user_profiles_select_policy" on public."user_profiles";
drop policy if exists "user_profiles_select_self_public_or_owner_hidden" on public."user_profiles";
create policy "user_profiles_select_self_public_or_owner_hidden"
  on public."user_profiles"
  for select
  to authenticated
  using (
    auth.uid() is not null
    and (
      "user_id" = auth.uid()::text
      or (
        not public.is_platform_owner_user("user_id")
        and public.can_view_profile_content("user_id")
      )
    )
  );

create or replace function public.read_public_channel_profile(profile_user_id text)
returns table (
  user_id text,
  username text,
  avatar_index integer,
  display_name text,
  avatar_url text,
  tagline text,
  channel_layout_preset text,
  channel_role text,
  profile_visibility text,
  public_activity_visibility text,
  follower_surface_enabled boolean,
  subscriber_surface_enabled boolean,
  default_watch_party_join_policy text,
  default_watch_party_reactions_policy text,
  default_watch_party_content_access_rule text,
  default_watch_party_capture_policy text,
  default_communication_content_access_rule text,
  default_communication_capture_policy text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    profile.user_id,
    profile.username,
    profile.avatar_index,
    profile.display_name,
    profile.avatar_url,
    profile.tagline,
    profile.channel_layout_preset,
    profile.channel_role,
    profile.profile_visibility,
    profile.public_activity_visibility,
    profile.follower_surface_enabled,
    profile.subscriber_surface_enabled,
    null::text as default_watch_party_join_policy,
    null::text as default_watch_party_reactions_policy,
    null::text as default_watch_party_content_access_rule,
    null::text as default_watch_party_capture_policy,
    null::text as default_communication_content_access_rule,
    null::text as default_communication_capture_policy
  from public.user_profiles profile
  where profile.user_id = nullif(btrim(coalesce(profile_user_id, '')), '')
    and not public.is_platform_owner_user(profile.user_id)
    and public.can_view_profile_content(profile.user_id)
  limit 1;
$$;

drop policy if exists "profile_posts_select_public_clean_or_owner" on public."profile_posts";
create policy "profile_posts_select_public_clean_or_owner"
  on public."profile_posts"
  for select
  to public
  using (
    (
      "deleted_at" is null
      and "visibility" = 'public'
      and "moderation_status" in ('clean', 'reported')
      and public.can_view_profile_content("user_id")
    )
    or (
      auth.uid() is not null
      and "user_id" = auth.uid()::text
      and "deleted_at" is null
    )
    or (
      public.has_platform_role(array['owner'::text, 'operator'::text, 'moderator'::text])
      and not public.is_platform_owner_user("user_id")
    )
  );

drop policy if exists "profile_post_comments_select_public_clean_or_owner" on public."profile_post_comments";
create policy "profile_post_comments_select_public_clean_or_owner"
  on public."profile_post_comments"
  for select
  to public
  using (
    (
      "deleted_at" is null
      and "moderation_status" in ('clean', 'reported')
      and exists (
        select 1
        from public."profile_posts" post
        where post."id" = "profile_post_comments"."post_id"
          and post."deleted_at" is null
          and post."visibility" = 'public'
          and post."moderation_status" in ('clean', 'reported')
          and public.can_view_profile_content(post."user_id")
      )
    )
    or (
      auth.uid() is not null
      and "user_id" = auth.uid()::text
      and "deleted_at" is null
    )
    or (
      public.has_platform_role(array['owner'::text, 'operator'::text, 'moderator'::text])
      and exists (
        select 1
        from public."profile_posts" post
        where post."id" = "profile_post_comments"."post_id"
          and not public.is_platform_owner_user(post."user_id")
      )
    )
  );

drop policy if exists "profile_post_likes_select_public_clean" on public."profile_post_likes";
create policy "profile_post_likes_select_public_clean"
  on public."profile_post_likes"
  for select
  to public
  using (
    exists (
      select 1
      from public."profile_posts" post
      where post."id" = "profile_post_likes"."post_id"
        and post."deleted_at" is null
        and post."visibility" = 'public'
        and post."moderation_status" in ('clean', 'reported')
        and public.can_view_profile_content(post."user_id")
    )
    or (
      auth.uid() is not null
      and "user_id" = auth.uid()::text
    )
    or (
      public.has_platform_role(array['owner'::text, 'operator'::text, 'moderator'::text])
      and exists (
        select 1
        from public."profile_posts" post
        where post."id" = "profile_post_likes"."post_id"
          and not public.is_platform_owner_user(post."user_id")
      )
    )
  );

drop policy if exists "social_attachments_select_authorized" on public."social_attachments";
create policy "social_attachments_select_authorized"
  on public."social_attachments"
  for select
  to public
  using (
    "deleted_at" is null
    and "moderation_status" in ('clean', 'reported')
    and (
      (
        auth.uid() is not null
        and "owner_user_id" = auth.uid()::text
      )
      or (
        public.has_platform_role(array['owner'::text, 'operator'::text, 'moderator'::text])
        and not public.is_platform_owner_user("owner_user_id")
      )
      or (
        "surface_type" = 'profile_post'
        and exists (
          select 1
          from public."profile_posts" post
          where post."id" = "social_attachments"."surface_id"
            and post."deleted_at" is null
            and post."visibility" = 'public'
            and post."moderation_status" in ('clean', 'reported')
            and public.can_view_profile_content(post."user_id")
        )
      )
      or (
        "surface_type" = 'profile_post_comment'
        and exists (
          select 1
          from public."profile_post_comments" comment
          join public."profile_posts" post on post."id" = comment."post_id"
          where comment."id" = "social_attachments"."surface_id"
            and comment."deleted_at" is null
            and comment."moderation_status" in ('clean', 'reported')
            and post."deleted_at" is null
            and post."visibility" = 'public'
            and post."moderation_status" in ('clean', 'reported')
            and public.can_view_profile_content(post."user_id")
        )
      )
      or (
        "surface_type" = 'creator_video_comment'
        and exists (
          select 1
          from public."creator_video_comments" comment
          join public."videos" video on video."id" = comment."video_id"
          where comment."id" = "social_attachments"."surface_id"
            and comment."deleted_at" is null
            and comment."moderation_status" in ('clean', 'reported')
            and video."visibility" = 'public'
            and video."moderation_status" in ('clean', 'reported')
        )
      )
      or (
        "surface_type" = 'chat_message'
        and auth.uid() is not null
        and exists (
          select 1
          from public."chat_messages" message
          where message."id" = "social_attachments"."surface_id"
            and public.can_access_chat_thread(message."thread_id")
        )
      )
      or (
        "surface_type" = 'watch_party_room_message'
        and exists (
          select 1
          from public."watch_party_room_messages" message
          join public."watch_party_rooms" room on room."party_id" = message."party_id"
          where message."id" = "social_attachments"."surface_id"
        )
      )
    )
  );

drop policy if exists "channel_followers_insert_own" on public."channel_followers";
create policy "channel_followers_insert_own"
  on public."channel_followers"
  for insert
  to "authenticated"
  with check (
    (auth.uid() is not null)
    and follower_user_id = (auth.uid())::text
    and channel_user_id <> (auth.uid())::text
    and not public.is_platform_owner_user(channel_user_id)
  );

drop policy if exists "channel_followers_select_self_owner_or_operator" on public."channel_followers";
create policy "channel_followers_select_self_owner_or_operator"
  on public."channel_followers"
  for select
  to "authenticated"
  using (
    (auth.uid() is not null)
    and (
      channel_user_id = (auth.uid())::text
      or (
        not public.is_platform_owner_user(channel_user_id)
        and (
          follower_user_id = (auth.uid())::text
          or public.has_platform_role(array['owner'::text, 'operator'::text])
        )
      )
    )
  );

drop policy if exists "channel_audience_requests_insert_requester" on public."channel_audience_requests";
create policy "channel_audience_requests_insert_requester"
  on public."channel_audience_requests"
  for insert
  to "authenticated"
  with check (
    (auth.uid() is not null)
    and requester_user_id = (auth.uid())::text
    and channel_user_id <> (auth.uid())::text
    and not public.is_platform_owner_user(channel_user_id)
    and status = 'pending'::text
    and reviewed_at is null
    and reviewed_by is null
  );

drop policy if exists "channel_audience_requests_select_requester_owner_or_operator" on public."channel_audience_requests";
create policy "channel_audience_requests_select_requester_owner_or_operator"
  on public."channel_audience_requests"
  for select
  to "authenticated"
  using (
    (auth.uid() is not null)
    and (
      channel_user_id = (auth.uid())::text
      or (
        not public.is_platform_owner_user(channel_user_id)
        and (
          requester_user_id = (auth.uid())::text
          or public.has_platform_role(array['owner'::text, 'operator'::text])
        )
      )
    )
  );

drop policy if exists "user_friendships_select_participants" on public."user_friendships";
create policy "user_friendships_select_participants"
  on public."user_friendships"
  for select
  to "authenticated"
  using (
    (auth.uid() is not null)
    and (
      user_low_id = (auth.uid())::text
      or user_high_id = (auth.uid())::text
    )
    and (
      public.is_platform_owner_user((auth.uid())::text)
      or (
        not public.is_platform_owner_user(user_low_id)
        and not public.is_platform_owner_user(user_high_id)
      )
    )
  );

create or replace function public.request_friendship(target_user_id text)
returns public.user_friendships
language plpgsql
security definer
set search_path = public
as $$
declare
    actor_user_id text := (auth.uid())::text;
    normalized_target_user_id text := nullif(btrim(coalesce(target_user_id, '')), '');
    pair_low_id text;
    pair_high_id text;
    friendship_row public.user_friendships%rowtype;
begin
    if actor_user_id is null or actor_user_id = '' then
        raise exception 'Chi''lly Circle requires a signed-in user.';
    end if;

    if normalized_target_user_id is null then
        raise exception 'Target user id is required.';
    end if;

    if actor_user_id = normalized_target_user_id then
        raise exception 'You cannot request yourself.';
    end if;

    if actor_user_id = 'platform_rachi_official'::text or normalized_target_user_id = 'platform_rachi_official'::text then
        raise exception 'Official platform accounts are not part of Chi''lly Circle.';
    end if;

    if public.is_platform_owner_user(actor_user_id) or public.is_platform_owner_user(normalized_target_user_id) then
        raise exception 'This account is unavailable for Chi''lly Circle.';
    end if;

    if exists (
        select 1
        from public."channel_audience_blocks"
        where (
            channel_user_id = actor_user_id
            and blocked_user_id = normalized_target_user_id
        ) or (
            channel_user_id = normalized_target_user_id
            and blocked_user_id = actor_user_id
        )
        limit 1
    ) then
        raise exception 'Chi''lly Circle is unavailable while a channel audience block exists between these accounts.';
    end if;

    pair_low_id := least(actor_user_id, normalized_target_user_id);
    pair_high_id := greatest(actor_user_id, normalized_target_user_id);

    select *
    into friendship_row
    from public."user_friendships"
    where user_low_id = pair_low_id
      and user_high_id = pair_high_id
    limit 1;

    if not found then
        insert into public."user_friendships" (
            user_low_id,
            user_high_id,
            requested_by_user_id,
            status
        )
        values (
            pair_low_id,
            pair_high_id,
            actor_user_id,
            'pending'::text
        )
        returning *
        into friendship_row;

        return friendship_row;
    end if;

    if friendship_row.status = 'pending'::text then
        if friendship_row.requested_by_user_id = actor_user_id then
            return friendship_row;
        end if;

        raise exception 'An incoming Chi''lly Circle request is already waiting for your response.';
    end if;

    if friendship_row.status = 'active'::text then
        return friendship_row;
    end if;

    update public."user_friendships"
    set requested_by_user_id = actor_user_id,
        status = 'pending'::text,
        created_at = timezone('utc'::text, now()),
        responded_at = null,
        actioned_by_user_id = null,
        updated_at = timezone('utc'::text, now())
    where user_low_id = pair_low_id
      and user_high_id = pair_high_id
    returning *
    into friendship_row;

    return friendship_row;
end;
$$;

create or replace function public.respond_to_friendship(target_user_id text, next_action text)
returns public.user_friendships
language plpgsql
security definer
set search_path = public
as $$
declare
    actor_user_id text := (auth.uid())::text;
    normalized_target_user_id text := nullif(btrim(coalesce(target_user_id, '')), '');
    normalized_action text := lower(btrim(coalesce(next_action, '')));
    pair_low_id text;
    pair_high_id text;
    friendship_row public.user_friendships%rowtype;
begin
    if actor_user_id is null or actor_user_id = '' then
        raise exception 'Chi''lly Circle requires a signed-in user.';
    end if;

    if normalized_target_user_id is null then
        raise exception 'Target user id is required.';
    end if;

    if actor_user_id = normalized_target_user_id then
        raise exception 'You cannot update Chi''lly Circle with yourself.';
    end if;

    if public.is_platform_owner_user(actor_user_id) or public.is_platform_owner_user(normalized_target_user_id) then
        raise exception 'This account is unavailable for Chi''lly Circle.';
    end if;

    if exists (
        select 1
        from public."channel_audience_blocks"
        where (
            channel_user_id = actor_user_id
            and blocked_user_id = normalized_target_user_id
        ) or (
            channel_user_id = normalized_target_user_id
            and blocked_user_id = actor_user_id
        )
        limit 1
    ) then
        raise exception 'Chi''lly Circle is unavailable while a channel audience block exists between these accounts.';
    end if;

    pair_low_id := least(actor_user_id, normalized_target_user_id);
    pair_high_id := greatest(actor_user_id, normalized_target_user_id);

    select *
    into friendship_row
    from public."user_friendships"
    where user_low_id = pair_low_id
      and user_high_id = pair_high_id
    limit 1;

    if not found then
        raise exception 'No Chi''lly Circle request exists for this pair yet.';
    end if;

    if normalized_action = 'accept'::text then
        if friendship_row.status <> 'pending'::text then
            raise exception 'Only pending Chi''lly Circle requests can be accepted.';
        end if;
        if friendship_row.requested_by_user_id = actor_user_id then
            raise exception 'Only the recipient can accept a pending Chi''lly Circle request.';
        end if;

        update public."user_friendships"
        set status = 'active'::text,
            responded_at = timezone('utc'::text, now()),
            actioned_by_user_id = actor_user_id,
            updated_at = timezone('utc'::text, now())
        where user_low_id = pair_low_id
          and user_high_id = pair_high_id
        returning *
        into friendship_row;

        return friendship_row;
    end if;

    if normalized_action = 'decline'::text then
        if friendship_row.status <> 'pending'::text then
            raise exception 'Only pending Chi''lly Circle requests can be declined.';
        end if;
        if friendship_row.requested_by_user_id = actor_user_id then
            raise exception 'Only the recipient can decline a pending Chi''lly Circle request.';
        end if;

        update public."user_friendships"
        set status = 'declined'::text,
            responded_at = timezone('utc'::text, now()),
            actioned_by_user_id = actor_user_id,
            updated_at = timezone('utc'::text, now())
        where user_low_id = pair_low_id
          and user_high_id = pair_high_id
        returning *
        into friendship_row;

        return friendship_row;
    end if;

    if normalized_action = 'cancel'::text then
        if friendship_row.status <> 'pending'::text then
            raise exception 'Only pending Chi''lly Circle requests can be canceled.';
        end if;
        if friendship_row.requested_by_user_id <> actor_user_id then
            raise exception 'Only the sender can cancel a pending Chi''lly Circle request.';
        end if;

        update public."user_friendships"
        set status = 'canceled'::text,
            responded_at = timezone('utc'::text, now()),
            actioned_by_user_id = actor_user_id,
            updated_at = timezone('utc'::text, now())
        where user_low_id = pair_low_id
          and user_high_id = pair_high_id
        returning *
        into friendship_row;

        return friendship_row;
    end if;

    if normalized_action = 'remove'::text then
        if friendship_row.status <> 'active'::text then
            raise exception 'Only active Chi''lly Circle connections can be removed.';
        end if;

        update public."user_friendships"
        set status = 'removed'::text,
            responded_at = timezone('utc'::text, now()),
            actioned_by_user_id = actor_user_id,
            updated_at = timezone('utc'::text, now())
        where user_low_id = pair_low_id
          and user_high_id = pair_high_id
        returning *
        into friendship_row;

        return friendship_row;
    end if;

    raise exception 'Unsupported Chi''lly Circle action: %', normalized_action;
end;
$$;

create or replace function public."chat_thread_has_platform_owner"(target_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public."chat_thread_members" member
    where member."thread_id" = target_thread_id
      and public.is_platform_owner_user(member."user_id")
    limit 1
  );
$$;

create or replace function public.can_access_chat_thread(target_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and (
      not public.chat_thread_has_platform_owner(target_thread_id)
      or public.is_current_platform_owner()
    )
    and (
      exists (
        select 1
        from public.chat_threads thread
        where thread.id = target_thread_id
          and thread.created_by = auth.uid()::text
      )
      or exists (
        select 1
        from public.chat_thread_members member
        where member.thread_id = target_thread_id
          and member.user_id = auth.uid()::text
      )
    );
$$;

create or replace function public.can_manage_chat_thread_members(target_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and (
      not public.chat_thread_has_platform_owner(target_thread_id)
      or public.is_current_platform_owner()
    )
    and exists (
      select 1
      from public.chat_threads thread
      where thread.id = target_thread_id
        and thread.created_by = auth.uid()::text
    );
$$;

create or replace function public."prevent_platform_owner_chat_membership"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'chat_thread_auth_required';
  end if;

  if public.is_current_platform_owner() then
    return new;
  end if;

  if public.is_platform_owner_user(new."user_id") then
    raise exception 'owner_chat_unavailable';
  end if;

  if public.chat_thread_has_platform_owner(new."thread_id") then
    raise exception 'owner_chat_unavailable';
  end if;

  return new;
end;
$$;

drop trigger if exists "chat_thread_members_prevent_owner_target" on public."chat_thread_members";
create trigger "chat_thread_members_prevent_owner_target"
  before insert or update of "user_id", "thread_id" on public."chat_thread_members"
  for each row execute function public."prevent_platform_owner_chat_membership"();

drop policy if exists "discovery_feed_items_select_public_safe_authenticated"
  on public."discovery_feed_items";
create policy "discovery_feed_items_select_public_safe_authenticated"
  on public."discovery_feed_items"
  for select
  to authenticated
  using (
    "is_publicly_discoverable" = true
    and "visibility" = 'public'
    and "moderation_status" = 'clean'
    and "rights_status" in (
      'creator_owned',
      'chillywood_original',
      'licensed_for_public_stream'
    )
    and public.discovery_feed_item_blocked_for_current_user("id") = false
    and coalesce(public.is_platform_owner_user("owner_user_id"), false) = false
    and coalesce(public.is_platform_owner_user("channel_user_id"), false) = false
    and coalesce(public.is_platform_owner_user("host_user_id"), false) = false
    and coalesce(public.is_platform_owner_user("follow_signal_user_id"), false) = false
    and coalesce(public.is_platform_owner_user("circle_signal_user_id"), false) = false
  );

create or replace function public.user_has_active_entitlement(
  target_user_id text,
  required_entitlement_keys text[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    nullif(trim(coalesce(target_user_id, '')), '') is not null
    and coalesce(array_length(required_entitlement_keys, 1), 0) > 0
    and (
      (
        target_user_id = (auth.uid())::text
        and public.is_current_platform_owner()
      )
      or (
        (
          target_user_id = (auth.uid())::text
          or public.has_platform_role(array['owner'::text, 'operator'::text])
        )
        and exists (
          select 1
          from public."user_entitlements" entitlement
          where entitlement."user_id" = target_user_id
            and entitlement."entitlement_key" = any(required_entitlement_keys)
            and entitlement."status" in ('active', 'trialing', 'grace_period')
            and entitlement."revoked_at" is null
            and (
              entitlement."expires_at" is null
              or entitlement."expires_at" > timezone('utc'::text, now())
            )
        )
      )
    );
$$;

create or replace function public."monetization_has_active_premium"(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_platform_owner_user(p_user_id::text)
    or exists (
      select 1
      from public."user_entitlements" entitlement
      where entitlement."user_id" = p_user_id::text
        and entitlement."entitlement_key" = 'premium'
        and entitlement."status" in ('active', 'trialing', 'grace_period')
        and entitlement."revoked_at" is null
        and (
          entitlement."expires_at" is null
          or entitlement."expires_at" > timezone('utc'::text, now())
        )
    );
$$;

create table if not exists public."legal_evidence_requests" (
  "id" uuid default gen_random_uuid() not null,
  "requested_by_user_id" text,
  "requested_by_email" text,
  "request_kind" text not null,
  "reason" text not null,
  "search_scope" jsonb default '{}'::jsonb not null,
  "preview" jsonb default '{}'::jsonb not null,
  "export_manifest" jsonb,
  "export_hash" text,
  "status" text default 'previewed'::text not null,
  "created_at" timestamptz default timezone('utc'::text, now()) not null,
  "completed_at" timestamptz,
  constraint "legal_evidence_requests_pkey" primary key ("id"),
  constraint "legal_evidence_requests_kind_check"
    check ("request_kind" in ('search', 'preview', 'export')),
  constraint "legal_evidence_requests_reason_check"
    check (length(trim("reason")) >= 6),
  constraint "legal_evidence_requests_status_check"
    check ("status" in ('previewed', 'exported', 'failed'))
);

create index if not exists "legal_evidence_requests_created_at_idx"
  on public."legal_evidence_requests" ("created_at" desc);

create table if not exists public."legal_holds" (
  "id" uuid default gen_random_uuid() not null,
  "target_type" text not null,
  "target_id" text not null,
  "reason" text not null,
  "status" text default 'active'::text not null,
  "placed_by_user_id" text,
  "placed_by_email" text,
  "placed_at" timestamptz default timezone('utc'::text, now()) not null,
  "released_by_user_id" text,
  "released_by_email" text,
  "released_at" timestamptz,
  "release_reason" text,
  "metadata" jsonb default '{}'::jsonb not null,
  constraint "legal_holds_pkey" primary key ("id"),
  constraint "legal_holds_status_check"
    check ("status" in ('active', 'released')),
  constraint "legal_holds_reason_check"
    check (length(trim("reason")) >= 6),
  constraint "legal_holds_target_check"
    check (length(trim("target_type")) > 0 and length(trim("target_id")) > 0)
);

create index if not exists "legal_holds_target_idx"
  on public."legal_holds" ("target_type", "target_id", "status");

create table if not exists public."legal_evidence_audit_log" (
  "id" uuid default gen_random_uuid() not null,
  "actor_user_id" text,
  "actor_email" text,
  "actor_role" text,
  "action" text not null,
  "reason" text not null,
  "target_type" text,
  "target_id" text,
  "request_id" uuid,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamptz default timezone('utc'::text, now()) not null,
  constraint "legal_evidence_audit_log_pkey" primary key ("id"),
  constraint "legal_evidence_audit_log_action_check"
    check ("action" in ('search', 'preview', 'export', 'hold_place', 'hold_release', 'blocked')),
  constraint "legal_evidence_audit_log_reason_check"
    check (length(trim("reason")) >= 6)
);

create index if not exists "legal_evidence_audit_log_created_at_idx"
  on public."legal_evidence_audit_log" ("created_at" desc);

alter table public."legal_evidence_requests" enable row level security;
alter table public."legal_holds" enable row level security;
alter table public."legal_evidence_audit_log" enable row level security;

drop policy if exists "legal_evidence_requests_select_authorized"
  on public."legal_evidence_requests";
create policy "legal_evidence_requests_select_authorized"
  on public."legal_evidence_requests"
  for select
  to authenticated
  using (
    public.has_platform_role(array['owner'::text])
    or public.has_platform_permission('legal_review')
    or public.has_platform_permission('evidence_export')
  );

drop policy if exists "legal_holds_select_authorized"
  on public."legal_holds";
create policy "legal_holds_select_authorized"
  on public."legal_holds"
  for select
  to authenticated
  using (
    public.has_platform_role(array['owner'::text])
    or public.has_platform_permission('legal_review')
    or public.has_platform_permission('evidence_export')
  );

drop policy if exists "legal_evidence_audit_log_select_authorized"
  on public."legal_evidence_audit_log";
create policy "legal_evidence_audit_log_select_authorized"
  on public."legal_evidence_audit_log"
  for select
  to authenticated
  using (
    public.has_platform_role(array['owner'::text])
    or public.has_platform_permission('legal_review')
    or public.has_platform_permission('evidence_export')
  );

revoke all on table public."legal_evidence_requests" from "anon";
revoke all on table public."legal_holds" from "anon";
revoke all on table public."legal_evidence_audit_log" from "anon";
revoke all on table public."legal_evidence_requests" from "authenticated";
revoke all on table public."legal_holds" from "authenticated";
revoke all on table public."legal_evidence_audit_log" from "authenticated";
grant select on table public."legal_evidence_requests" to "authenticated";
grant select on table public."legal_holds" to "authenticated";
grant select on table public."legal_evidence_audit_log" to "authenticated";
grant all on table public."legal_evidence_requests" to "service_role";
grant all on table public."legal_holds" to "service_role";
grant all on table public."legal_evidence_audit_log" to "service_role";

create or replace function public."legal_evidence_audit_prevent_mutation"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'legal_evidence_audit_append_only';
end;
$$;

drop trigger if exists "legal_evidence_audit_no_update" on public."legal_evidence_audit_log";
create trigger "legal_evidence_audit_no_update"
  before update or delete on public."legal_evidence_audit_log"
  for each row execute function public."legal_evidence_audit_prevent_mutation"();

comment on table public."platform_staff_permission_grants" is
  'Owner-granted scoped staff permissions. Direct client writes are blocked; protected RPCs write and audit changes.';

comment on table public."legal_evidence_requests" is
  'Reason-required legal/evidence preview and export records. Writes happen through trusted backend paths only.';

comment on table public."legal_holds" is
  'Audited legal holds. This table marks preservation intent and never deletes evidence.';

comment on table public."legal_evidence_audit_log" is
  'Append-only audit trail for legal/evidence search, preview, export, and hold actions.';
