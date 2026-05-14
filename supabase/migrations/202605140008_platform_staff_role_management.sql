-- Platform Owner/Admin/Moderator role management hardening.
-- Chi'llywood uses the existing internal `operator` platform role as the
-- public-facing Admin role. Staff changes are only allowed through the
-- security-definer RPCs below; normal clients keep read-only RLS visibility.

alter table public."platform_role_memberships"
  add column if not exists "updated_at" timestamptz not null default timezone('utc'::text, now());

alter table public."platform_role_memberships"
  add column if not exists "revoked_by" text;

alter table public."platform_role_memberships"
  add column if not exists "revoked_at" timestamptz;

update public."platform_role_memberships"
set
  "email" = lower(trim("email")),
  "updated_at" = coalesce("updated_at", "granted_at", timezone('utc'::text, now()))
where "email" is not null
  and "email" <> lower(trim("email"));

create index if not exists "platform_role_memberships_email_status_idx"
  on public."platform_role_memberships" (lower("email"), "status", "granted_at" desc)
  where "email" is not null and length(trim("email")) > 0;

create table if not exists public."platform_staff_role_audit" (
  "id" uuid default gen_random_uuid() not null,
  "actor_user_id" text,
  "actor_email" text,
  "actor_role" text,
  "target_user_id" text,
  "target_email" text,
  "action" text not null,
  "role" text not null,
  "reason" text,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamptz default timezone('utc'::text, now()) not null,
  constraint "platform_staff_role_audit_pkey" primary key ("id"),
  constraint "platform_staff_role_audit_action_check"
    check ("action" in ('grant', 'revoke', 'blocked', 'bootstrap')),
  constraint "platform_staff_role_audit_role_check"
    check ("role" in ('owner', 'operator', 'moderator')),
  constraint "platform_staff_role_audit_actor_role_check"
    check ("actor_role" is null or "actor_role" in ('owner', 'operator', 'moderator', 'member', 'system'))
);

create index if not exists "platform_staff_role_audit_created_at_idx"
  on public."platform_staff_role_audit" ("created_at" desc);

create index if not exists "platform_staff_role_audit_target_email_idx"
  on public."platform_staff_role_audit" (lower("target_email"), "created_at" desc)
  where "target_email" is not null and length(trim("target_email")) > 0;

alter table public."platform_staff_role_audit" enable row level security;

drop policy if exists "platform_staff_role_audit_select_owner_operator" on public."platform_staff_role_audit";
create policy "platform_staff_role_audit_select_owner_operator"
  on public."platform_staff_role_audit"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

revoke all on table public."platform_staff_role_audit" from "anon";
revoke all on table public."platform_staff_role_audit" from "authenticated";
grant select on table public."platform_staff_role_audit" to "authenticated";

revoke insert, update, delete on table public."platform_role_memberships" from "anon";
revoke insert, update, delete on table public."platform_role_memberships" from "authenticated";
grant select on table public."platform_role_memberships" to "authenticated";

comment on table public."platform_staff_role_audit" is
  'Append-style staff role management audit. Owner/operator may read; normal users cannot read staff history.';

comment on table public."platform_role_memberships" is
  'Backed platform staff roles. Internal role operator is Chi''llywood Admin. Direct writes stay blocked for normal clients; use security-definer RPCs.';

create or replace function public."platform_staff_normalize_email"(p_email text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(lower(trim(coalesce(p_email, ''))), '');
$$;

create or replace function public."platform_staff_normalize_role"(p_role text)
returns text
language sql
immutable
set search_path = public
as $$
  select case lower(trim(coalesce(p_role, '')))
    when 'owner' then 'owner'
    when 'admin' then 'operator'
    when 'operator' then 'operator'
    when 'moderator' then 'moderator'
    else null
  end;
$$;

create or replace function public."platform_staff_actor_role"()
returns text
language sql
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then null
    when public.has_platform_role(array['owner'::text]) then 'owner'
    when public.has_platform_role(array['operator'::text]) then 'operator'
    when public.has_platform_role(array['moderator'::text]) then 'moderator'
    else null
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
begin
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
    nullif(trim(coalesce(p_actor_role, '')), ''),
    public.platform_staff_normalize_email(p_target_email),
    p_action,
    p_role,
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
      concat('platform_staff_role_', p_action),
      'role',
      'platform_role_membership',
      concat(public.platform_staff_normalize_email(p_target_email), ':', p_role),
      nullif(trim(coalesce(p_reason, '')), ''),
      case when p_action = 'blocked' then 'warning' else 'notice' end,
      coalesce(p_metadata, '{}'::jsonb)
    );
  end if;
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

  if not (
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

  if not (
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

revoke all on function public."platform_staff_normalize_email"(text) from public;
revoke all on function public."platform_staff_normalize_role"(text) from public;
revoke all on function public."platform_staff_actor_role"() from public;
revoke all on function public."platform_staff_write_audit"(text, text, text, text, text, text, text, jsonb) from public;
revoke all on function public."admin_grant_platform_role_by_email"(text, text, text) from public;
revoke all on function public."admin_revoke_platform_role_by_email"(text, text, text) from public;

grant execute on function public."platform_staff_actor_role"() to authenticated;
grant execute on function public."admin_grant_platform_role_by_email"(text, text, text) to authenticated;
grant execute on function public."admin_revoke_platform_role_by_email"(text, text, text) to authenticated;

comment on function public."admin_grant_platform_role_by_email"(text, text, text) is
  'Security-definer staff grant RPC. Owner may grant Admin/operator and Moderator. Admin/operator may grant Moderator only.';

comment on function public."admin_revoke_platform_role_by_email"(text, text, text) is
  'Security-definer staff revoke RPC with last-active-Owner protection. Owner may revoke Admin/operator and Moderator; Admin/operator may revoke Moderator only.';

do $$
declare
  v_owner_email text := 'rob2008gn@gmail.com';
  v_admin_email text := 'chillywood92@gmail.com';
  v_role_id bigint;
begin
  update public."platform_role_memberships"
  set
    "email" = v_owner_email,
    "status" = 'active',
    "notes" = 'Bootstrap Owner for Chi''llywood platform access.',
    "granted_by" = coalesce("granted_by", 'system-bootstrap'),
    "granted_at" = coalesce("granted_at", timezone('utc'::text, now())),
    "updated_at" = timezone('utc'::text, now()),
    "revoked_by" = null,
    "revoked_at" = null
  where lower("email") = v_owner_email
    and "role" = 'owner'
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
      'owner',
      v_owner_email,
      'active',
      'Bootstrap Owner for Chi''llywood platform access.',
      'system-bootstrap',
      timezone('utc'::text, now()),
      timezone('utc'::text, now())
    )
    returning "id" into v_role_id;
  end if;

  perform public.platform_staff_write_audit(
    'system-bootstrap',
    null,
    'system',
    v_owner_email,
    'bootstrap',
    'owner',
    'Bootstrap Owner role by normalized email.',
    jsonb_build_object('owner_email', v_owner_email, 'auth_user_required', false)
  );

  v_role_id := null;

  update public."platform_role_memberships"
  set
    "email" = v_admin_email,
    "status" = 'active',
    "notes" = 'Bootstrap Admin for Chi''llywood platform access. Internal role: operator.',
    "granted_by" = coalesce("granted_by", 'system-bootstrap'),
    "granted_at" = coalesce("granted_at", timezone('utc'::text, now())),
    "updated_at" = timezone('utc'::text, now()),
    "revoked_by" = null,
    "revoked_at" = null
  where lower("email") = v_admin_email
    and "role" = 'operator'
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
      'operator',
      v_admin_email,
      'active',
      'Bootstrap Admin for Chi''llywood platform access. Internal role: operator.',
      'system-bootstrap',
      timezone('utc'::text, now()),
      timezone('utc'::text, now())
    )
    returning "id" into v_role_id;
  end if;

  perform public.platform_staff_write_audit(
    'system-bootstrap',
    null,
    'system',
    v_admin_email,
    'bootstrap',
    'operator',
    'Bootstrap Admin role by normalized email.',
    jsonb_build_object('admin_email', v_admin_email, 'internal_role', 'operator', 'auth_user_required', false)
  );
end $$;
