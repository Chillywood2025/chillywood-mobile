-- First Owner authority, Owner succession, and First Owner-only Break Glass.
-- This is additive over the existing platform_role_memberships role model.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public."platform_first_owner_authority" (
  "id" uuid not null default gen_random_uuid(),
  "owner_membership_id" bigint not null references public."platform_role_memberships"("id") on delete restrict,
  "owner_user_id" text,
  "owner_email" text,
  "is_active" boolean not null default true,
  "established_by" text not null default 'system-migration',
  "established_reason" text not null,
  "established_at" timestamptz not null default timezone('utc'::text, now()),
  "retired_at" timestamptz,
  "retired_by" text,
  "retired_reason" text,
  "metadata" jsonb not null default '{}'::jsonb,
  constraint "platform_first_owner_authority_pkey" primary key ("id"),
  constraint "platform_first_owner_authority_email_check"
    check ("owner_email" is null or length(trim("owner_email")) > 0),
  constraint "platform_first_owner_authority_metadata_object_check"
    check (jsonb_typeof("metadata") = 'object')
);

create unique index if not exists "platform_first_owner_authority_single_active_uidx"
  on public."platform_first_owner_authority" ((is_active))
  where "is_active" = true;

create unique index if not exists "platform_first_owner_authority_active_membership_uidx"
  on public."platform_first_owner_authority" ("owner_membership_id")
  where "is_active" = true;

create table if not exists public."platform_owner_succession_challenges" (
  "id" uuid not null default gen_random_uuid(),
  "actor_user_id" text not null,
  "actor_email" text,
  "successor_owner_membership_id" bigint not null references public."platform_role_memberships"("id") on delete restrict,
  "successor_user_id" text,
  "successor_email" text,
  "action" text not null default 'first_owner_self_step_down',
  "target_owner_membership_id" bigint not null references public."platform_role_memberships"("id") on delete restrict,
  "passcode_hash" text not null,
  "passcode_salt" text not null,
  "expires_at" timestamptz not null,
  "consumed_at" timestamptz,
  "attempt_count" integer not null default 0,
  "max_attempts" integer not null default 5,
  "last_attempt_at" timestamptz,
  "status" text not null default 'active',
  "reason" text not null,
  "typed_confirmation_required" text not null default 'STEP DOWN FIRST OWNER',
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "metadata" jsonb not null default '{}'::jsonb,
  constraint "platform_owner_succession_challenges_pkey" primary key ("id"),
  constraint "platform_owner_succession_challenges_action_check"
    check ("action" = 'first_owner_self_step_down'),
  constraint "platform_owner_succession_challenges_status_check"
    check ("status" in ('active', 'consumed', 'expired', 'locked')),
  constraint "platform_owner_succession_challenges_reason_check"
    check (length(trim("reason")) >= 6),
  constraint "platform_owner_succession_challenges_hash_check"
    check (length(trim("passcode_hash")) >= 32 and length(trim("passcode_salt")) >= 16),
  constraint "platform_owner_succession_challenges_attempts_check"
    check ("attempt_count" >= 0 and "max_attempts" between 1 and 10),
  constraint "platform_owner_succession_challenges_metadata_object_check"
    check (jsonb_typeof("metadata") = 'object')
);

create index if not exists "platform_owner_succession_challenges_actor_idx"
  on public."platform_owner_succession_challenges" ("actor_user_id", "status", "created_at" desc);

create table if not exists public."platform_first_owner_authority_audit" (
  "id" uuid not null default gen_random_uuid(),
  "actor_user_id" text,
  "actor_email" text,
  "actor_role" text not null default 'member',
  "action" text not null,
  "target_user_id" text,
  "target_email" text,
  "target_membership_id" bigint,
  "reason" text,
  "result" text not null,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "platform_first_owner_authority_audit_pkey" primary key ("id"),
  constraint "platform_first_owner_authority_audit_action_check"
    check ("action" in (
      'seed_first_owner',
      'grant_owner',
      'revoke_owner',
      'challenge_created',
      'challenge_failed',
      'challenge_consumed',
      'first_owner_succession',
      'break_glass_activate',
      'break_glass_end',
      'blocked'
    )),
  constraint "platform_first_owner_authority_audit_result_check"
    check ("result" in ('success', 'denied', 'failed', 'blocked')),
  constraint "platform_first_owner_authority_audit_metadata_object_check"
    check (jsonb_typeof("metadata") = 'object')
);

create index if not exists "platform_first_owner_authority_audit_created_idx"
  on public."platform_first_owner_authority_audit" ("created_at" desc);

create or replace function public."is_first_owner"(
  p_actor_user_id text default auth.uid()::text,
  p_actor_email text default (auth.jwt() ->> 'email')
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select false;
$$;

alter table public."platform_first_owner_authority" enable row level security;
alter table public."platform_owner_succession_challenges" enable row level security;
alter table public."platform_first_owner_authority_audit" enable row level security;

drop policy if exists "platform_first_owner_authority_select_owner" on public."platform_first_owner_authority";
create policy "platform_first_owner_authority_select_owner"
  on public."platform_first_owner_authority"
  for select
  to authenticated
  using (public.has_platform_role(array['owner'::text]));

drop policy if exists "platform_owner_succession_challenges_select_first_owner" on public."platform_owner_succession_challenges";
create policy "platform_owner_succession_challenges_select_first_owner"
  on public."platform_owner_succession_challenges"
  for select
  to authenticated
  using (public.is_first_owner());

drop policy if exists "platform_first_owner_authority_audit_select_owner" on public."platform_first_owner_authority_audit";
create policy "platform_first_owner_authority_audit_select_owner"
  on public."platform_first_owner_authority_audit"
  for select
  to authenticated
  using (public.has_platform_role(array['owner'::text]));

revoke all on table public."platform_first_owner_authority" from anon, authenticated;
revoke all on table public."platform_owner_succession_challenges" from anon, authenticated;
revoke all on table public."platform_first_owner_authority_audit" from anon, authenticated;
grant select on table public."platform_first_owner_authority" to authenticated;
grant select on table public."platform_first_owner_authority_audit" to authenticated;
grant all on table public."platform_first_owner_authority" to service_role;
grant all on table public."platform_owner_succession_challenges" to service_role;
grant insert, select on table public."platform_first_owner_authority_audit" to service_role;
revoke update, delete on table public."platform_first_owner_authority_audit" from service_role;

create or replace function public."platform_first_owner_audit_prevent_mutation"()
returns trigger
language plpgsql
as $$
begin
  raise exception 'platform_first_owner_audit_append_only';
end;
$$;

drop trigger if exists "platform_first_owner_authority_audit_no_update" on public."platform_first_owner_authority_audit";
create trigger "platform_first_owner_authority_audit_no_update"
  before update or delete on public."platform_first_owner_authority_audit"
  for each row execute function public."platform_first_owner_audit_prevent_mutation"();

create or replace function public."platform_first_owner_marker_guard"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_owner_count integer;
begin
  if new."is_active" then
    select count(*) into v_active_owner_count
    from public."platform_role_memberships" membership
    where membership."id" = new."owner_membership_id"
      and membership."role" = 'owner'
      and membership."status" = 'active'
      and (
        (new."owner_user_id" is null or membership."user_id" is null or membership."user_id" = new."owner_user_id")
        and (new."owner_email" is null or membership."email" is null or lower(membership."email") = public.platform_staff_normalize_email(new."owner_email"))
      );

    if coalesce(v_active_owner_count, 0) <> 1 then
      raise exception 'first_owner_must_be_active_owner';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists "platform_first_owner_marker_guard_trigger" on public."platform_first_owner_authority";
create trigger "platform_first_owner_marker_guard_trigger"
  before insert or update on public."platform_first_owner_authority"
  for each row execute function public."platform_first_owner_marker_guard"();

create or replace function public."first_owner_active_marker"()
returns table (
  id uuid,
  owner_membership_id bigint,
  owner_user_id text,
  owner_email text,
  established_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select marker."id", marker."owner_membership_id", marker."owner_user_id", marker."owner_email", marker."established_at"
  from public."platform_first_owner_authority" marker
  join public."platform_role_memberships" membership
    on membership."id" = marker."owner_membership_id"
   and membership."role" = 'owner'
   and membership."status" = 'active'
  where marker."is_active" = true
  order by marker."established_at" asc
  limit 1;
$$;

create or replace function public."is_first_owner"(
  p_actor_user_id text default auth.uid()::text,
  p_actor_email text default (auth.jwt() ->> 'email')
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with marker as (
    select *
    from public."first_owner_active_marker"()
    limit 1
  ),
  actor as (
    select nullif(trim(coalesce(p_actor_user_id, '')), '') as user_id,
           public.platform_staff_normalize_email(p_actor_email) as email
  )
  select exists (
    select 1
    from marker, actor
    where (
      marker.owner_user_id is not null
      and actor.user_id is not null
      and marker.owner_user_id = actor.user_id
    )
    or (
      marker.owner_email is not null
      and actor.email is not null
      and lower(marker.owner_email) = actor.email
    )
  );
$$;

create or replace function public."first_owner_authority_status"()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_marker record;
  v_active_owner_count integer;
  v_actor_is_owner boolean := public.has_platform_role(array['owner'::text]);
  v_actor_is_first_owner boolean := public.is_first_owner();
begin
  if auth.uid() is null then
    raise exception 'first_owner_auth_required';
  end if;

  if not v_actor_is_owner then
    raise exception 'owner_required';
  end if;

  select * into v_marker
  from public."first_owner_active_marker"()
  limit 1;

  select count(*) into v_active_owner_count
  from public."platform_role_memberships"
  where "role" = 'owner'
    and "status" = 'active';

  return jsonb_build_object(
    'status', case when v_marker.id is null then 'blocked_pending_first_owner_seed' else 'enabled' end,
    'actorIsFirstOwner', v_actor_is_first_owner,
    'actorIsOwner', v_actor_is_owner,
    'activeOwnerCount', coalesce(v_active_owner_count, 0),
    'firstOwnerMarkerExists', v_marker.id is not null,
    'firstOwnerMembershipId', v_marker.owner_membership_id,
    'firstOwnerUserIdPresent', v_marker.owner_user_id is not null,
    'firstOwnerEmailPresent', v_marker.owner_email is not null,
    'establishedAt', v_marker.established_at,
    'controlsEnabled', v_marker.id is not null and v_actor_is_first_owner,
    'normalOwnerCanGrantOwner', false,
    'normalOwnerCanRevokeOwner', false,
    'breakGlassFirstOwnerOnly', true
  );
end;
$$;

create or replace function public."platform_first_owner_write_audit"(
  p_actor_user_id text,
  p_actor_email text,
  p_actor_role text,
  p_action text,
  p_target_user_id text,
  p_target_email text,
  p_target_membership_id bigint,
  p_reason text,
  p_result text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public."platform_first_owner_authority_audit" (
    "actor_user_id",
    "actor_email",
    "actor_role",
    "action",
    "target_user_id",
    "target_email",
    "target_membership_id",
    "reason",
    "result",
    "metadata"
  )
  values (
    nullif(trim(coalesce(p_actor_user_id, '')), ''),
    public.platform_staff_normalize_email(p_actor_email),
    coalesce(nullif(trim(coalesce(p_actor_role, '')), ''), 'member'),
    p_action,
    nullif(trim(coalesce(p_target_user_id, '')), ''),
    public.platform_staff_normalize_email(p_target_email),
    p_target_membership_id,
    nullif(trim(coalesce(p_reason, '')), ''),
    p_result,
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
      coalesce(nullif(trim(coalesce(p_actor_role, '')), ''), 'member'),
      concat('first_owner_', p_action),
      'role',
      'platform_first_owner_authority',
      coalesce(p_target_membership_id::text, public.platform_staff_normalize_email(p_target_email), 'first_owner'),
      nullif(trim(coalesce(p_reason, '')), ''),
      case when p_result in ('denied', 'failed', 'blocked') then 'warning' else 'notice' end,
      coalesce(p_metadata, '{}'::jsonb)
    );
  end if;
end;
$$;

create or replace function public."first_owner_hash_passcode"(
  p_passcode text,
  p_salt text,
  p_actor_user_id text,
  p_action text,
  p_target_owner_membership_id bigint,
  p_successor_owner_membership_id bigint
)
returns text
language sql
immutable
security definer
set search_path = public, extensions
as $$
  select encode(
    digest(
      coalesce(p_salt, '') || ':' ||
      coalesce(p_actor_user_id, '') || ':' ||
      coalesce(p_action, '') || ':' ||
      coalesce(p_target_owner_membership_id::text, '') || ':' ||
      coalesce(p_successor_owner_membership_id::text, '') || ':' ||
      coalesce(p_passcode, ''),
      'sha256'
    ),
    'hex'
  );
$$;

create or replace function public."first_owner_grant_owner_by_email"(
  p_target_email text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id text := auth.uid()::text;
  v_actor_email text := public.platform_staff_normalize_email(auth.jwt() ->> 'email');
  v_actor_role text := public.platform_staff_actor_role();
  v_target_email text := public.platform_staff_normalize_email(p_target_email);
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_role_id bigint;
  v_target_user_id text;
  v_target_blocked boolean := false;
  v_marker_exists boolean;
begin
  if auth.uid() is null then
    raise exception 'first_owner_auth_required';
  end if;

  select exists(select 1 from public."first_owner_active_marker"()) into v_marker_exists;
  if not v_marker_exists then
    raise exception 'first_owner_seed_required';
  end if;

  if not public.is_first_owner(v_actor_user_id, v_actor_email) then
    perform public.platform_first_owner_write_audit(v_actor_user_id, v_actor_email, coalesce(v_actor_role, 'member'), 'grant_owner', null, v_target_email, null, coalesce(v_reason, 'Only First Owner can grant Owner.'), 'denied', jsonb_build_object('blocked_reason', 'first_owner_required'));
    raise exception 'first_owner_required';
  end if;

  if v_target_email is null then
    raise exception 'target_email_required';
  end if;

  if v_reason is null or length(v_reason) < 6 then
    raise exception 'first_owner_reason_required';
  end if;

  if to_regclass('auth.users') is not null then
    select user_row.id::text,
           (coalesce(user_row.deleted_at is not null, false)
             or coalesce(user_row.banned_until > timezone('utc'::text, now()), false))
    into v_target_user_id, v_target_blocked
    from auth.users user_row
    where lower(user_row.email) = v_target_email
    order by user_row.created_at desc
    limit 1;
  end if;

  if coalesce(v_target_blocked, false) then
    perform public.platform_first_owner_write_audit(v_actor_user_id, v_actor_email, v_actor_role, 'grant_owner', v_target_user_id, v_target_email, null, v_reason, 'blocked', jsonb_build_object('blocked_reason', 'target_disabled_or_deleted'));
    raise exception 'target_not_active';
  end if;

  if v_target_user_id is not null
    and to_regprocedure('public.is_account_access_restricted(text)') is not null
    and public.is_account_access_restricted(v_target_user_id)
  then
    perform public.platform_first_owner_write_audit(v_actor_user_id, v_actor_email, v_actor_role, 'grant_owner', v_target_user_id, v_target_email, null, v_reason, 'blocked', jsonb_build_object('blocked_reason', 'target_restricted_or_scheduled_for_purge'));
    raise exception 'target_not_active';
  end if;

  update public."platform_role_memberships"
  set
    "email" = v_target_email,
    "user_id" = coalesce(v_target_user_id, "user_id"),
    "status" = 'active',
    "granted_by" = v_actor_user_id,
    "granted_at" = timezone('utc'::text, now()),
    "updated_at" = timezone('utc'::text, now()),
    "revoked_by" = null,
    "revoked_at" = null,
    "notes" = v_reason
  where "role" = 'owner'
    and lower("email") = v_target_email
  returning "id" into v_role_id;

  if v_role_id is null then
    insert into public."platform_role_memberships" (
      "role",
      "user_id",
      "email",
      "status",
      "notes",
      "granted_by",
      "granted_at",
      "updated_at"
    )
    values (
      'owner',
      v_target_user_id,
      v_target_email,
      'active',
      v_reason,
      v_actor_user_id,
      timezone('utc'::text, now()),
      timezone('utc'::text, now())
    )
    returning "id" into v_role_id;
  end if;

  perform public.platform_staff_write_audit(v_actor_user_id, v_actor_email, 'owner', v_target_email, 'grant', 'owner', v_reason, jsonb_build_object('first_owner_authority', true));
  perform public.platform_first_owner_write_audit(v_actor_user_id, v_actor_email, 'owner', 'grant_owner', v_target_user_id, v_target_email, v_role_id, v_reason, 'success', jsonb_build_object('stale_authority_invalidation', 'role_read_paths_filter_active_memberships'));

  return jsonb_build_object('ok', true, 'membershipId', v_role_id, 'targetEmailPresent', v_target_email is not null, 'targetUserIdPresent', v_target_user_id is not null, 'role', 'owner', 'status', 'active');
end;
$$;

create or replace function public."first_owner_revoke_owner_by_email"(
  p_target_email text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id text := auth.uid()::text;
  v_actor_email text := public.platform_staff_normalize_email(auth.jwt() ->> 'email');
  v_actor_role text := public.platform_staff_actor_role();
  v_target_email text := public.platform_staff_normalize_email(p_target_email);
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_role_id bigint;
  v_target_user_id text;
  v_active_owner_count integer;
  v_target_active_count integer;
begin
  if auth.uid() is null then
    raise exception 'first_owner_auth_required';
  end if;

  if not exists(select 1 from public."first_owner_active_marker"()) then
    raise exception 'first_owner_seed_required';
  end if;

  if not public.is_first_owner(v_actor_user_id, v_actor_email) then
    perform public.platform_first_owner_write_audit(v_actor_user_id, v_actor_email, coalesce(v_actor_role, 'member'), 'revoke_owner', null, v_target_email, null, coalesce(v_reason, 'Only First Owner can revoke Owner.'), 'denied', jsonb_build_object('blocked_reason', 'first_owner_required'));
    raise exception 'first_owner_required';
  end if;

  if v_target_email is null then
    raise exception 'target_email_required';
  end if;

  if v_reason is null or length(v_reason) < 6 then
    raise exception 'first_owner_reason_required';
  end if;

  if v_target_email = v_actor_email then
    perform public.platform_first_owner_write_audit(v_actor_user_id, v_actor_email, 'owner', 'revoke_owner', v_actor_user_id, v_target_email, null, v_reason, 'blocked', jsonb_build_object('blocked_reason', 'normal_path_self_revoke_denied'));
    raise exception 'first_owner_self_revoke_requires_succession';
  end if;

  select count(*) into v_active_owner_count
  from public."platform_role_memberships"
  where "status" = 'active'
    and "role" = 'owner';

  select count(*), max("id"), max("user_id")
  into v_target_active_count, v_role_id, v_target_user_id
  from public."platform_role_memberships"
  where "status" = 'active'
    and "role" = 'owner'
    and lower("email") = v_target_email;

  if coalesce(v_target_active_count, 0) = 0 then
    raise exception 'owner_role_not_found';
  end if;

  if coalesce(v_active_owner_count, 0) <= coalesce(v_target_active_count, 0) then
    perform public.platform_first_owner_write_audit(v_actor_user_id, v_actor_email, 'owner', 'revoke_owner', v_target_user_id, v_target_email, v_role_id, v_reason, 'blocked', jsonb_build_object('blocked_reason', 'last_owner_protection'));
    raise exception 'last_owner_required';
  end if;

  update public."platform_role_memberships"
  set
    "status" = 'revoked',
    "revoked_by" = v_actor_user_id,
    "revoked_at" = timezone('utc'::text, now()),
    "updated_at" = timezone('utc'::text, now()),
    "notes" = v_reason
  where "status" = 'active'
    and "role" = 'owner'
    and lower("email") = v_target_email;

  perform public.platform_staff_write_audit(v_actor_user_id, v_actor_email, 'owner', v_target_email, 'revoke', 'owner', v_reason, jsonb_build_object('first_owner_authority', true));
  perform public.platform_first_owner_write_audit(v_actor_user_id, v_actor_email, 'owner', 'revoke_owner', v_target_user_id, v_target_email, v_role_id, v_reason, 'success', jsonb_build_object('stale_authority_invalidation', 'active_role_revoked'));

  return jsonb_build_object('ok', true, 'membershipId', v_role_id, 'targetEmailPresent', true, 'role', 'owner', 'status', 'revoked');
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

create or replace function public."first_owner_create_self_step_down_challenge"(
  p_successor_owner_email text,
  p_passcode_hash text,
  p_passcode_salt text,
  p_reason text,
  p_expires_at timestamptz default timezone('utc'::text, now()) + interval '10 minutes'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id text := auth.uid()::text;
  v_actor_email text := public.platform_staff_normalize_email(auth.jwt() ->> 'email');
  v_successor_email text := public.platform_staff_normalize_email(p_successor_owner_email);
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_target_membership_id bigint;
  v_successor_membership_id bigint;
  v_successor_user_id text;
  v_active_owner_count integer;
  v_challenge_id uuid;
begin
  if auth.uid() is null then
    raise exception 'first_owner_auth_required';
  end if;

  if not public.is_first_owner(v_actor_user_id, v_actor_email) then
    raise exception 'first_owner_required';
  end if;

  if v_reason is null or length(v_reason) < 6 then
    raise exception 'first_owner_reason_required';
  end if;

  if v_successor_email is null then
    raise exception 'successor_required';
  end if;

  if v_successor_email = v_actor_email then
    raise exception 'successor_must_be_different_owner';
  end if;

  if length(trim(coalesce(p_passcode_hash, ''))) < 32 or length(trim(coalesce(p_passcode_salt, ''))) < 16 then
    raise exception 'passcode_hash_required';
  end if;

  if p_expires_at is null or p_expires_at <= timezone('utc'::text, now()) or p_expires_at > timezone('utc'::text, now()) + interval '15 minutes' then
    raise exception 'passcode_expiry_invalid';
  end if;

  select count(*) into v_active_owner_count
  from public."platform_role_memberships"
  where "status" = 'active'
    and "role" = 'owner';

  if coalesce(v_active_owner_count, 0) < 2 then
    raise exception 'successor_owner_required';
  end if;

  select "id" into v_target_membership_id
  from public."platform_role_memberships"
  where "status" = 'active'
    and "role" = 'owner'
    and (
      "user_id" = v_actor_user_id
      or lower("email") = v_actor_email
    )
  order by "granted_at" asc
  limit 1;

  select "id", "user_id" into v_successor_membership_id, v_successor_user_id
  from public."platform_role_memberships"
  where "status" = 'active'
    and "role" = 'owner'
    and lower("email") = v_successor_email
  order by "granted_at" asc
  limit 1;

  if v_target_membership_id is null or v_successor_membership_id is null then
    raise exception 'successor_owner_required';
  end if;

  update public."platform_owner_succession_challenges"
  set "status" = 'expired'
  where "actor_user_id" = v_actor_user_id
    and "status" = 'active'
    and "action" = 'first_owner_self_step_down';

  insert into public."platform_owner_succession_challenges" (
    "actor_user_id",
    "actor_email",
    "successor_owner_membership_id",
    "successor_user_id",
    "successor_email",
    "target_owner_membership_id",
    "passcode_hash",
    "passcode_salt",
    "expires_at",
    "reason",
    "metadata"
  )
  values (
    v_actor_user_id,
    v_actor_email,
    v_successor_membership_id,
    v_successor_user_id,
    v_successor_email,
    v_target_membership_id,
    trim(p_passcode_hash),
    trim(p_passcode_salt),
    p_expires_at,
    v_reason,
    jsonb_build_object('password_reauth_required', true, 'passcode_plaintext_stored', false, 'single_use', true, 'rate_limited', true)
  )
  returning "id" into v_challenge_id;

  perform public.platform_first_owner_write_audit(v_actor_user_id, v_actor_email, 'owner', 'challenge_created', v_successor_user_id, v_successor_email, v_successor_membership_id, v_reason, 'success', jsonb_build_object('challenge_id', v_challenge_id, 'expires_at', p_expires_at, 'passcode_plaintext_stored', false));

  return jsonb_build_object('ok', true, 'challengeId', v_challenge_id, 'expiresAt', p_expires_at, 'typedConfirmationRequired', 'STEP DOWN FIRST OWNER');
end;
$$;

create or replace function public."first_owner_complete_self_step_down"(
  p_challenge_id uuid,
  p_passcode_hash text,
  p_typed_confirmation text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id text := auth.uid()::text;
  v_actor_email text := public.platform_staff_normalize_email(auth.jwt() ->> 'email');
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_challenge record;
  v_new_marker_id uuid;
begin
  if auth.uid() is null then
    raise exception 'first_owner_auth_required';
  end if;

  if not public.is_first_owner(v_actor_user_id, v_actor_email) then
    raise exception 'first_owner_required';
  end if;

  if v_reason is null or length(v_reason) < 6 then
    raise exception 'first_owner_reason_required';
  end if;

  select * into v_challenge
  from public."platform_owner_succession_challenges"
  where "id" = p_challenge_id
    and "actor_user_id" = v_actor_user_id
    and "action" = 'first_owner_self_step_down'
  for update;

  if v_challenge.id is null then
    raise exception 'challenge_not_found';
  end if;

  if v_challenge.status <> 'active' or v_challenge.consumed_at is not null then
    raise exception 'challenge_not_active';
  end if;

  if v_challenge.expires_at <= timezone('utc'::text, now()) then
    update public."platform_owner_succession_challenges" set "status" = 'expired' where "id" = p_challenge_id;
    raise exception 'challenge_expired';
  end if;

  if v_challenge.attempt_count >= v_challenge.max_attempts then
    update public."platform_owner_succession_challenges" set "status" = 'locked' where "id" = p_challenge_id;
    raise exception 'challenge_locked';
  end if;

  if trim(coalesce(p_typed_confirmation, '')) <> v_challenge.typed_confirmation_required then
    update public."platform_owner_succession_challenges"
    set "attempt_count" = "attempt_count" + 1, "last_attempt_at" = timezone('utc'::text, now())
    where "id" = p_challenge_id;
    perform public.platform_first_owner_write_audit(v_actor_user_id, v_actor_email, 'owner', 'challenge_failed', v_challenge.successor_user_id, v_challenge.successor_email, v_challenge.successor_owner_membership_id, v_reason, 'failed', jsonb_build_object('challenge_id', p_challenge_id, 'failed_reason', 'typed_confirmation_mismatch'));
    raise exception 'typed_confirmation_required';
  end if;

  if trim(coalesce(p_passcode_hash, '')) <> v_challenge.passcode_hash then
    update public."platform_owner_succession_challenges"
    set "attempt_count" = "attempt_count" + 1, "last_attempt_at" = timezone('utc'::text, now()),
        "status" = case when "attempt_count" + 1 >= "max_attempts" then 'locked' else "status" end
    where "id" = p_challenge_id;
    perform public.platform_first_owner_write_audit(v_actor_user_id, v_actor_email, 'owner', 'challenge_failed', v_challenge.successor_user_id, v_challenge.successor_email, v_challenge.successor_owner_membership_id, v_reason, 'failed', jsonb_build_object('challenge_id', p_challenge_id, 'failed_reason', 'passcode_mismatch'));
    raise exception 'passcode_invalid';
  end if;

  if not exists (
    select 1 from public."platform_role_memberships"
    where "id" = v_challenge.successor_owner_membership_id
      and "role" = 'owner'
      and "status" = 'active'
  ) then
    raise exception 'successor_owner_required';
  end if;

  update public."platform_first_owner_authority"
  set
    "is_active" = false,
    "retired_at" = timezone('utc'::text, now()),
    "retired_by" = v_actor_user_id,
    "retired_reason" = v_reason
  where "is_active" = true;

  insert into public."platform_first_owner_authority" (
    "owner_membership_id",
    "owner_user_id",
    "owner_email",
    "is_active",
    "established_by",
    "established_reason",
    "metadata"
  )
  values (
    v_challenge.successor_owner_membership_id,
    v_challenge.successor_user_id,
    v_challenge.successor_email,
    true,
    v_actor_user_id,
    v_reason,
    jsonb_build_object('succession_challenge_id', p_challenge_id)
  )
  returning "id" into v_new_marker_id;

  update public."platform_role_memberships"
  set
    "status" = 'revoked',
    "revoked_by" = v_actor_user_id,
    "revoked_at" = timezone('utc'::text, now()),
    "updated_at" = timezone('utc'::text, now()),
    "notes" = v_reason
  where "id" = v_challenge.target_owner_membership_id
    and "role" = 'owner'
    and "status" = 'active';

  update public."platform_owner_succession_challenges"
  set
    "status" = 'consumed',
    "consumed_at" = timezone('utc'::text, now())
  where "id" = p_challenge_id;

  perform public.platform_first_owner_write_audit(v_actor_user_id, v_actor_email, 'owner', 'challenge_consumed', v_challenge.successor_user_id, v_challenge.successor_email, v_challenge.successor_owner_membership_id, v_reason, 'success', jsonb_build_object('challenge_id', p_challenge_id, 'new_marker_id', v_new_marker_id));
  perform public.platform_first_owner_write_audit(v_actor_user_id, v_actor_email, 'owner', 'first_owner_succession', v_challenge.successor_user_id, v_challenge.successor_email, v_challenge.successor_owner_membership_id, v_reason, 'success', jsonb_build_object('previous_owner_membership_id', v_challenge.target_owner_membership_id, 'new_marker_id', v_new_marker_id));

  return jsonb_build_object('ok', true, 'newFirstOwnerMarkerId', v_new_marker_id, 'successorMembershipId', v_challenge.successor_owner_membership_id, 'previousOwnerStatus', 'revoked');
end;
$$;

create or replace function public."platform_first_owner_only_break_glass"(
  p_actor_user_id text default auth.uid()::text,
  p_actor_email text default (auth.jwt() ->> 'email')
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_first_owner(p_actor_user_id, p_actor_email);
$$;

revoke all on function public."first_owner_active_marker"() from public;
revoke all on function public."is_first_owner"(text, text) from public;
revoke all on function public."first_owner_authority_status"() from public;
revoke all on function public."platform_first_owner_write_audit"(text, text, text, text, text, text, bigint, text, text, jsonb) from public;
revoke all on function public."first_owner_hash_passcode"(text, text, text, text, bigint, bigint) from public;
revoke all on function public."first_owner_grant_owner_by_email"(text, text) from public;
revoke all on function public."first_owner_revoke_owner_by_email"(text, text) from public;
revoke all on function public."first_owner_create_self_step_down_challenge"(text, text, text, text, timestamptz) from public;
revoke all on function public."first_owner_complete_self_step_down"(uuid, text, text, text) from public;
revoke all on function public."platform_first_owner_only_break_glass"(text, text) from public;

grant execute on function public."is_first_owner"(text, text) to authenticated, service_role;
grant execute on function public."first_owner_authority_status"() to authenticated, service_role;
grant execute on function public."first_owner_hash_passcode"(text, text, text, text, bigint, bigint) to authenticated, service_role;
grant execute on function public."first_owner_grant_owner_by_email"(text, text) to authenticated, service_role;
grant execute on function public."first_owner_revoke_owner_by_email"(text, text) to authenticated, service_role;
grant execute on function public."first_owner_create_self_step_down_challenge"(text, text, text, text, timestamptz) to authenticated, service_role;
grant execute on function public."first_owner_complete_self_step_down"(uuid, text, text, text) to authenticated, service_role;
grant execute on function public."platform_first_owner_only_break_glass"(text, text) to authenticated, service_role;

do $$
declare
  v_owner_count integer;
  v_owner record;
begin
  select count(*) into v_owner_count
  from public."platform_role_memberships"
  where "role" = 'owner'
    and "status" = 'active';

  if v_owner_count = 1 and not exists (select 1 from public."platform_first_owner_authority" where "is_active" = true) then
    select * into v_owner
    from public."platform_role_memberships"
    where "role" = 'owner'
      and "status" = 'active'
    order by "granted_at" asc, "id" asc
    limit 1;

    insert into public."platform_first_owner_authority" (
      "owner_membership_id",
      "owner_user_id",
      "owner_email",
      "is_active",
      "established_by",
      "established_reason",
      "metadata"
    )
    values (
      v_owner."id",
      v_owner."user_id",
      v_owner."email",
      true,
      'system-migration',
      'First Owner marker established from the existing sole active Owner row.',
      jsonb_build_object('source', 'existing_active_owner_membership', 'private_identity_not_repeated_in_docs', true)
    );

    perform public.platform_first_owner_write_audit(
      'system-migration',
      null,
      'system',
      'seed_first_owner',
      v_owner."user_id",
      v_owner."email",
      v_owner."id",
      'First Owner marker established from the existing sole active Owner row.',
      'success',
      jsonb_build_object('source', 'existing_active_owner_membership')
    );
  end if;
end $$;

comment on table public."platform_first_owner_authority" is
  'Exactly-one active First Owner marker. First Owner is the root platform owner and must also be an active Owner.';
comment on table public."platform_owner_succession_challenges" is
  'Single-use hashed passcode challenges for First Owner self-step-down/succession. Plaintext passcodes are never stored.';
comment on table public."platform_first_owner_authority_audit" is
  'Append-only First Owner authority audit for owner grants, revokes, succession challenges, and First Owner Break Glass.';
comment on function public."first_owner_grant_owner_by_email"(text, text) is
  'Enabled production Owner grant path. Only authenticated First Owner can grant Owner, with reason and audit.';
comment on function public."first_owner_revoke_owner_by_email"(text, text) is
  'Enabled production Owner revoke path. Only authenticated First Owner can revoke another Owner; normal self-revoke is denied.';
comment on function public."first_owner_complete_self_step_down"(uuid, text, text, text) is
  'Completes First Owner self-step-down only after successor, password re-auth, generated passcode, typed confirmation, reason, and audit.';
