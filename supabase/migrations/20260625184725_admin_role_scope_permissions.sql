-- Admin role scope and permissions production hardening.
--
-- The public Admin role remains the existing internal `operator` platform role.
-- This migration extends the existing scoped staff-permission system instead of
-- creating a second role model, and tightens account suspend/restore so Admins
-- need exact scopes. Owner/First Owner authority remains governed by the
-- existing First Owner migration.

create or replace function public."platform_staff_normalize_permission_key"(p_permission_key text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_key text := lower(trim(coalesce(p_permission_key, '')));
begin
  if v_key = 'moderator_grants' then
    return 'manage_moderators';
  end if;

  if v_key in (
    'support_inbox',
    'user_lookup',
    'content_moderation',
    'reports_review',
    'live_ops',
    'billing_support_read',
    'creator_support',
    'legal_review',
    'evidence_preview',
    'dmca_review',
    'copyright_review',
    'evidence_export',
    'legal_hold',
    'legal_ops',
    'emergency_break_glass',
    'admin_grants',
    'manage_moderators',
    'audit_review',
    'security_review',
    'staff_permission_templates',
    'legal_request_intake',
    'admin.user.search',
    'admin.user.view',
    'admin.user.suspend',
    'admin.user.restore',
    'admin.support.view',
    'admin.support.manage',
    'admin.dmca.view',
    'admin.dmca.manage',
    'admin.payment_status.view',
    'admin.refund_status.record',
    'admin.profile_private.view',
    'admin.room_private.view',
    'admin.chat_evidence.view',
    'admin.content.hide',
    'admin.content.restore',
    'admin.content.remove',
    'admin.comment.moderate',
    'admin.room.moderate',
    'admin.live.force_end',
    'admin.audit.view',
    'admin.lower_role.manage'
  ) then
    return v_key;
  end if;

  return null;
end;
$$;

alter table public."platform_staff_permission_grants"
  drop constraint if exists "platform_staff_permission_grants_permission_check";

alter table public."platform_staff_permission_grants"
  add constraint "platform_staff_permission_grants_permission_check"
  check (public.platform_staff_normalize_permission_key("permission_key") is not null);

alter table public."platform_staff_permission_audit"
  drop constraint if exists "platform_staff_permission_audit_permission_check";

alter table public."platform_staff_permission_audit"
  add constraint "platform_staff_permission_audit_permission_check"
  check (public.platform_staff_normalize_permission_key("permission_key") is not null);

create or replace function public."platform_admin_scope_legacy_aliases"(p_permission_key text)
returns text[]
language plpgsql
immutable
set search_path = public
as $$
declare
  v_key text := public.platform_staff_normalize_permission_key(p_permission_key);
begin
  if v_key is null then
    return array[]::text[];
  end if;

  return case v_key
    when 'user_lookup' then array['user_lookup', 'admin.user.search', 'admin.user.view']
    when 'support_inbox' then array['support_inbox', 'admin.support.view', 'admin.support.manage', 'admin.user.view']
    when 'creator_support' then array['creator_support', 'admin.support.manage']
    when 'billing_support_read' then array['billing_support_read', 'admin.payment_status.view']
    when 'dmca_review' then array['dmca_review', 'admin.dmca.view', 'admin.dmca.manage']
    when 'copyright_review' then array['copyright_review', 'admin.dmca.view', 'admin.dmca.manage']
    when 'legal_review' then array['legal_review', 'admin.dmca.view', 'admin.dmca.manage', 'admin.profile_private.view', 'admin.chat_evidence.view']
    when 'evidence_preview' then array['evidence_preview', 'admin.chat_evidence.view']
    when 'content_moderation' then array['content_moderation', 'admin.content.hide', 'admin.content.restore', 'admin.content.remove', 'admin.comment.moderate']
    when 'reports_review' then array['reports_review', 'admin.room_private.view', 'admin.room.moderate']
    when 'live_ops' then array['live_ops', 'admin.room_private.view', 'admin.room.moderate', 'admin.live.force_end']
    when 'audit_review' then array['audit_review', 'admin.audit.view']
    when 'security_review' then array['security_review', 'admin.audit.view']
    when 'manage_moderators' then array['manage_moderators', 'admin.lower_role.manage']
    when 'admin.user.search' then array['admin.user.search', 'user_lookup']
    when 'admin.user.view' then array['admin.user.view', 'user_lookup', 'support_inbox']
    when 'admin.support.view' then array['admin.support.view', 'support_inbox']
    when 'admin.support.manage' then array['admin.support.manage', 'support_inbox', 'creator_support']
    when 'admin.dmca.view' then array['admin.dmca.view', 'dmca_review', 'copyright_review', 'legal_review']
    when 'admin.dmca.manage' then array['admin.dmca.manage', 'dmca_review', 'copyright_review', 'legal_review']
    when 'admin.payment_status.view' then array['admin.payment_status.view', 'billing_support_read']
    when 'admin.profile_private.view' then array['admin.profile_private.view', 'support_inbox', 'legal_review']
    when 'admin.room_private.view' then array['admin.room_private.view', 'reports_review', 'live_ops']
    when 'admin.chat_evidence.view' then array['admin.chat_evidence.view', 'legal_review', 'evidence_preview']
    when 'admin.content.hide' then array['admin.content.hide', 'content_moderation']
    when 'admin.content.restore' then array['admin.content.restore', 'content_moderation']
    when 'admin.content.remove' then array['admin.content.remove', 'content_moderation']
    when 'admin.comment.moderate' then array['admin.comment.moderate', 'content_moderation']
    when 'admin.room.moderate' then array['admin.room.moderate', 'live_ops', 'reports_review']
    when 'admin.live.force_end' then array['admin.live.force_end', 'live_ops']
    when 'admin.audit.view' then array['admin.audit.view', 'audit_review', 'security_review']
    when 'admin.lower_role.manage' then array['admin.lower_role.manage', 'manage_moderators']
    else array[v_key]
  end;
end;
$$;

create or replace function public."has_platform_permission"(p_permission_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor_user_id text := auth.uid()::text;
  v_actor_email text := public.platform_staff_normalize_email(auth.jwt() ->> 'email');
  v_permission_key text := public.platform_staff_normalize_permission_key(p_permission_key);
  v_aliases text[] := public.platform_admin_scope_legacy_aliases(p_permission_key);
begin
  if auth.uid() is null or v_permission_key is null then
    return false;
  end if;

  if public.has_platform_role(array['owner'::text]) then
    return true;
  end if;

  return exists (
    select 1
    from public."platform_staff_permission_grants" grant_row
    where grant_row."status" = 'active'
      and grant_row."permission_key" = any(v_aliases)
      and (
        grant_row."expires_at" is null
        or grant_row."expires_at" > timezone('utc'::text, now())
      )
      and (
        (v_actor_user_id is not null and grant_row."target_user_id" = v_actor_user_id)
        or (v_actor_email is not null and lower(grant_row."target_email") = v_actor_email)
      )
      and public.has_platform_role(array['operator'::text, 'moderator'::text])
  );
end;
$$;

create or replace function public."admin_suspend_account_for_support"(
  p_target_user_id text,
  p_reason text default null,
  p_duration_minutes integer default 43200
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor text := nullif((auth.uid())::text, '');
  v_actor_email text := lower(nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), ''));
  v_target text := nullif(btrim(coalesce(p_target_user_id, '')), '');
  v_target_uuid uuid;
  v_reason text := left(nullif(btrim(coalesce(p_reason, '')), ''), 500);
  v_minutes integer := greatest(5, least(coalesce(p_duration_minutes, 43200), 525600));
  v_before timestamptz;
  v_after timestamptz := timezone('utc'::text, now()) + make_interval(mins => greatest(5, least(coalesce(p_duration_minutes, 43200), 525600)));
begin
  if auth.role() <> 'service_role'
    and (
      v_actor is null
      or not (
        public.has_platform_role(array['owner'::text])
        or (
          public.has_platform_role(array['operator'::text])
          and public.has_platform_permission('admin.user.suspend')
        )
      )
    )
  then
    raise exception 'admin_user_suspend_permission_required';
  end if;

  if v_reason is null or length(v_reason) < 6 then
    raise exception 'admin_action_reason_required';
  end if;

  if v_target is null then
    raise exception 'target_user_required';
  end if;

  begin
    v_target_uuid := v_target::uuid;
  exception
    when invalid_text_representation then
      raise exception 'invalid_target_user';
  end;

  if v_actor = v_target then
    raise exception 'cannot_suspend_self';
  end if;

  if public.is_first_owner(v_target, null) then
    raise exception 'first_owner_target_protected';
  end if;

  select auth_user.banned_until
    into v_before
    from auth.users auth_user
    where auth_user.id = v_target_uuid;

  if not found then
    raise exception 'target_user_not_found';
  end if;

  update auth.users
    set banned_until = v_after
    where id = v_target_uuid;

  insert into public."platform_admin_audit_logs" (
    "actor_user_id",
    "actor_email",
    "actor_role",
    "action",
    "action_category",
    "target_type",
    "target_id",
    "target_user_id",
    "reason",
    "severity",
    "before_state",
    "after_state",
    "metadata"
  ) values (
    v_actor,
    v_actor_email,
    case
      when public.has_platform_role(array['owner'::text]) then 'owner'
      when public.has_platform_role(array['operator'::text]) then 'operator'
      when auth.role() = 'service_role' then 'service_role'
      else 'unknown'
    end,
    'admin_suspend_account_for_support',
    'system',
    'auth_user',
    v_target,
    v_target,
    v_reason,
    'warning',
    jsonb_build_object('bannedUntil', v_before),
    jsonb_build_object('bannedUntil', v_after),
    jsonb_build_object(
      'source', 'admin_role_scope_permissions',
      'requiredPermission', 'admin.user.suspend',
      'durationMinutes', v_minutes,
      'providerRefundExecuted', false,
      'liveMoneyAction', false,
      'firstOwnerProtected', true
    )
  );

  return jsonb_build_object(
    'status', 'suspended',
    'restricted', true,
    'targetUserIdSuffix', right(v_target, 8),
    'bannedUntil', v_after,
    'providerRefundExecuted', false,
    'liveMoneyAction', false
  );
end;
$$;

create or replace function public."admin_restore_account_for_support"(
  p_target_user_id text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor text := nullif((auth.uid())::text, '');
  v_actor_email text := lower(nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), ''));
  v_target text := nullif(btrim(coalesce(p_target_user_id, '')), '');
  v_target_uuid uuid;
  v_reason text := left(nullif(btrim(coalesce(p_reason, '')), ''), 500);
  v_before timestamptz;
begin
  if auth.role() <> 'service_role'
    and (
      v_actor is null
      or not (
        public.has_platform_role(array['owner'::text])
        or (
          public.has_platform_role(array['operator'::text])
          and public.has_platform_permission('admin.user.restore')
        )
      )
    )
  then
    raise exception 'admin_user_restore_permission_required';
  end if;

  if v_reason is null or length(v_reason) < 6 then
    raise exception 'admin_action_reason_required';
  end if;

  if v_target is null then
    raise exception 'target_user_required';
  end if;

  begin
    v_target_uuid := v_target::uuid;
  exception
    when invalid_text_representation then
      raise exception 'invalid_target_user';
  end;

  if public.is_first_owner(v_target, null) then
    raise exception 'first_owner_target_protected';
  end if;

  select auth_user.banned_until
    into v_before
    from auth.users auth_user
    where auth_user.id = v_target_uuid;

  if not found then
    raise exception 'target_user_not_found';
  end if;

  update auth.users
    set banned_until = null
    where id = v_target_uuid;

  insert into public."platform_admin_audit_logs" (
    "actor_user_id",
    "actor_email",
    "actor_role",
    "action",
    "action_category",
    "target_type",
    "target_id",
    "target_user_id",
    "reason",
    "severity",
    "before_state",
    "after_state",
    "metadata"
  ) values (
    v_actor,
    v_actor_email,
    case
      when public.has_platform_role(array['owner'::text]) then 'owner'
      when public.has_platform_role(array['operator'::text]) then 'operator'
      when auth.role() = 'service_role' then 'service_role'
      else 'unknown'
    end,
    'admin_restore_account_for_support',
    'system',
    'auth_user',
    v_target,
    v_target,
    v_reason,
    'notice',
    jsonb_build_object('bannedUntil', v_before),
    jsonb_build_object('bannedUntil', null),
    jsonb_build_object(
      'source', 'admin_role_scope_permissions',
      'requiredPermission', 'admin.user.restore',
      'providerRefundExecuted', false,
      'liveMoneyAction', false,
      'firstOwnerProtected', true
    )
  );

  return jsonb_build_object(
    'status', 'active',
    'restricted', public."is_account_access_restricted"(v_target),
    'targetUserIdSuffix', right(v_target, 8),
    'providerRefundExecuted', false,
    'liveMoneyAction', false
  );
end;
$$;

revoke all on function public."platform_staff_normalize_permission_key"(text) from public;
revoke all on function public."platform_admin_scope_legacy_aliases"(text) from public;
revoke all on function public."has_platform_permission"(text) from public;
revoke all on function public."admin_suspend_account_for_support"(text, text, integer) from public;
revoke all on function public."admin_restore_account_for_support"(text, text) from public;

grant execute on function public."has_platform_permission"(text) to authenticated, service_role;
grant execute on function public."admin_suspend_account_for_support"(text, text, integer) to authenticated, service_role;
grant execute on function public."admin_restore_account_for_support"(text, text) to authenticated, service_role;

comment on function public."platform_admin_scope_legacy_aliases"(text) is
  'Maps production admin.* scopes to existing scoped-permission keys where legacy permissions already back the same operational surface.';

comment on function public."admin_suspend_account_for_support"(text, text, integer) is
  'Owner or scoped Admin account support action. Admin requires admin.user.suspend, reason, audit, and cannot suspend First Owner. Does not execute provider refunds or money actions.';

comment on function public."admin_restore_account_for_support"(text, text) is
  'Owner or scoped Admin account support action. Admin requires admin.user.restore, reason, audit, and cannot target First Owner. Does not execute provider refunds or money actions.';
