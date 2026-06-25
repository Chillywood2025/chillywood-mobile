-- Controlled account purge / de-identification production enablement.
--
-- This migration enables a production-capable single-user owner/operator RPC
-- for accounts whose restore window has expired. It intentionally keeps broad
-- batch purge disabled by default, requires explicit batch enablement in config
-- and call arguments, retains legal/support/audit/payment records, and performs
-- no provider refund or live-money action.

set check_function_bodies = false;

create table if not exists public."account_purge_runtime_config" (
  "id" boolean primary key default true,
  "single_user_enabled" boolean not null default true,
  "batch_enabled" boolean not null default false,
  "emergency_stop" boolean not null default false,
  "max_batch_size" integer not null default 10,
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_by" text,
  "note" text,
  constraint "account_purge_runtime_config_singleton_check" check ("id" is true),
  constraint "account_purge_runtime_config_max_batch_size_check" check ("max_batch_size" between 1 and 25)
);

alter table public."account_purge_runtime_config" enable row level security;

revoke all on table public."account_purge_runtime_config" from anon, authenticated;
grant all on table public."account_purge_runtime_config" to service_role;

insert into public."account_purge_runtime_config" (
  "id",
  "single_user_enabled",
  "batch_enabled",
  "emergency_stop",
  "max_batch_size",
  "note"
) values (
  true,
  true,
  false,
  false,
  10,
  'Single-user owner/operator purge is enabled. Batch purge is disabled by default.'
)
on conflict ("id") do update
  set
    "single_user_enabled" = excluded."single_user_enabled",
    "batch_enabled" = false,
    "emergency_stop" = false,
    "max_batch_size" = least(greatest(public."account_purge_runtime_config"."max_batch_size", 1), 25),
    "updated_at" = timezone('utc'::text, now()),
    "note" = excluded."note";

create or replace function public."admin_account_purge_runtime_status"()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := nullif((auth.uid())::text, '');
  v_config public."account_purge_runtime_config"%rowtype;
begin
  if auth.role() <> 'service_role'
    and (v_actor is null or not public.has_platform_role(array['owner'::text, 'operator'::text]))
  then
    raise exception 'owner_or_operator_required';
  end if;

  select *
    into v_config
    from public."account_purge_runtime_config"
    where "id" is true;

  return jsonb_build_object(
    'singleUserEnabled', coalesce(v_config."single_user_enabled", false),
    'batchEnabled', coalesce(v_config."batch_enabled", false),
    'emergencyStop', coalesce(v_config."emergency_stop", true),
    'maxBatchSize', coalesce(v_config."max_batch_size", 0),
    'batchDefaultOff', true
  );
end;
$$;

create or replace function public."account_purge_deidentification_counts"(p_target_user_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'profiles', (select count(*) from public."user_profiles" where "user_id" = p_target_user_id),
    'pushTokens', (select count(*) from public."user_push_tokens" where "user_id"::text = p_target_user_id),
    'notifications', (
      select count(*)
      from public."notifications"
      where "user_id"::text = p_target_user_id or "actor_user_id"::text = p_target_user_id
    ),
    'accountDeletionRequests', (
      select count(*)
      from public."account_deletion_requests"
      where "user_id"::text = p_target_user_id and "status" = 'scheduled'
    ),
    'completedDeletionRequests', (
      select count(*)
      from public."account_deletion_requests"
      where "user_id"::text = p_target_user_id and "status" = 'completed'
    ),
    'chatMessages', (select count(*) from public."chat_messages" where "sender_user_id" = p_target_user_id),
    'communicationRoomsHosted', (select count(*) from public."communication_rooms" where "host_user_id" = p_target_user_id),
    'watchPartyRoomsHosted', (select count(*) from public."watch_party_rooms" where "host_user_id"::text = p_target_user_id),
    'creatorVideos', (select count(*) from public."videos" where "owner_id"::text = p_target_user_id),
    'creatorVideoComments', (select count(*) from public."creator_video_comments" where "user_id" = p_target_user_id),
    'profilePostComments', (select count(*) from public."profile_post_comments" where "user_id" = p_target_user_id),
    'safetyReports', (select count(*) from public."safety_reports" where "reporter_user_id" = p_target_user_id),
    'dmcaCases', (select count(*) from public."dmca_cases" where "reporter_user_id" = p_target_user_id),
    'adminAuditLogs', (select count(*) from public."platform_admin_audit_logs" where "target_user_id" = p_target_user_id or "actor_user_id" = p_target_user_id),
    'premiumEntitlements', (select count(*) from public."user_entitlements" where "user_id" = p_target_user_id)
  );
$$;

create or replace function public."admin_deidentify_deleted_account"(
  p_target_user_id text,
  p_reason text default null,
  p_dry_run boolean default true
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
  v_target_email text;
  v_target_username text;
  v_reason text := left(nullif(btrim(coalesce(p_reason, '')), ''), 500);
  v_now timestamptz := timezone('utc'::text, now());
  v_config public."account_purge_runtime_config"%rowtype;
  v_deletion public."account_deletion_requests"%rowtype;
  v_completed public."account_deletion_requests"%rowtype;
  v_is_protected_account boolean := false;
  v_is_active_sandbox_tester boolean := false;
  v_restore_window_expired boolean := false;
  v_already_deidentified boolean := false;
  v_deidentified_username text;
  v_counts jsonb;
  v_profile_count integer := 0;
  v_push_count integer := 0;
  v_notification_count integer := 0;
  v_deletion_count integer := 0;
begin
  if auth.role() <> 'service_role'
    and (v_actor is null or not public.has_platform_role(array['owner'::text, 'operator'::text]))
  then
    raise exception 'owner_or_operator_required';
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
    raise exception 'cannot_deidentify_self';
  end if;

  select *
    into v_config
    from public."account_purge_runtime_config"
    where "id" is true;

  if coalesce(v_config."emergency_stop", true) then
    raise exception 'account_purge_disabled';
  end if;

  if not coalesce(v_config."single_user_enabled", false) then
    raise exception 'single_user_purge_disabled';
  end if;

  select lower(coalesce(auth_user.email, ''))
    into v_target_email
    from auth.users auth_user
    where auth_user.id = v_target_uuid;

  if not found then
    raise exception 'target_user_not_found';
  end if;

  select profile."username"
    into v_target_username
    from public."user_profiles" profile
    where profile."user_id" = v_target;

  select exists (
    select 1
    from public."platform_role_memberships" membership
    where membership."status" = 'active'
      and (
        membership."user_id" = v_target
        or (
          membership."email" is not null
          and lower(membership."email") = v_target_email
        )
      )
      and membership."role" in ('owner', 'operator', 'moderator')
  ) into v_is_protected_account;

  if coalesce(v_is_protected_account, false) then
    raise exception 'protected_account_purge_denied';
  end if;

  select exists (
    select 1
    from public."sandbox_monetization_testers" tester
    where tester."status" = 'active'
      and (tester."expires_at" is null or tester."expires_at" > v_now)
      and (
        tester."user_id" = v_target
        or lower(coalesce(tester."email", '')) = v_target_email
      )
  ) into v_is_active_sandbox_tester;

  if coalesce(v_is_active_sandbox_tester, false) then
    raise exception 'protected_tester_purge_denied';
  end if;

  select *
    into v_deletion
    from public."account_deletion_requests" deletion
    where deletion."user_id" = v_target_uuid
      and deletion."status" = 'scheduled'
    order by deletion."requested_at" desc
    limit 1;

  select *
    into v_completed
    from public."account_deletion_requests" deletion
    where deletion."user_id" = v_target_uuid
      and deletion."status" = 'completed'
    order by deletion."processed_at" desc nulls last, deletion."requested_at" desc
    limit 1;

  v_already_deidentified :=
    v_completed."id" is not null
    and exists (
      select 1
      from auth.users auth_user
      where auth_user.id = v_target_uuid
        and coalesce(auth_user.raw_app_meta_data, '{}'::jsonb) ->> 'accountDeidentified' = 'true'
    );

  if v_already_deidentified then
    return jsonb_build_object(
      'status', 'already_deidentified',
      'mutationPerformed', false,
      'targetUserIdSuffix', right(v_target, 8),
      'idempotent', true,
      'providerRefundExecuted', false,
      'liveMoneyAction', false
    );
  end if;

  if v_deletion."id" is null then
    raise exception 'scheduled_deletion_required';
  end if;

  v_restore_window_expired := coalesce(v_deletion."restore_deadline", v_deletion."delete_after") <= v_now;
  if not v_restore_window_expired then
    raise exception 'restore_window_still_open';
  end if;

  v_counts := public."account_purge_deidentification_counts"(v_target);

  if coalesce(p_dry_run, true) then
    return jsonb_build_object(
      'status', 'dry_run',
      'mutationPerformed', false,
      'targetUserIdSuffix', right(v_target, 8),
      'eligible', true,
      'restoreWindowExpired', v_restore_window_expired,
      'wouldDeidentify', jsonb_build_object(
        'profileIdentity', true,
        'pushTokens', true,
        'notifications', true,
        'accountDeletionRequest', true,
        'authAccess', 'restricted'
      ),
      'retainedCategories', jsonb_build_array(
        'support_report_dmca',
        'admin_audit',
        'payment_provider_records',
        'abuse_security_logs',
        'content_references'
      ),
      'counts', v_counts,
      'providerRefundExecuted', false,
      'liveMoneyAction', false
    );
  end if;

  v_deidentified_username := 'deleteduser' || right(replace(v_target, '-', ''), 12);

  update public."user_profiles"
    set
      "display_name" = 'Deleted user',
      "username" = v_deidentified_username,
      "tagline" = null,
      "avatar_url" = null,
      "profile_background_url" = null,
      "profile_visibility" = 'private',
      "profile_access_visibility" = 'private',
      "platform_access_visibility" = 'private',
      "public_activity_visibility" = 'private',
      "likes_visibility" = 'private',
      "shares_visibility" = 'private',
      "follower_surface_enabled" = false,
      "subscriber_surface_enabled" = false,
      "updated_at" = v_now
    where "user_id" = v_target;
  get diagnostics v_profile_count = row_count;

  update public."user_push_tokens"
    set
      "enabled" = false,
      "revoked_at" = coalesce("revoked_at", v_now),
      "token" = 'deidentified:' || "id"::text,
      "token_hash" = 'deidentified:' || "id"::text,
      "token_fingerprint" = 'deidentified',
      "device_id" = null,
      "install_id" = null,
      "metadata" = jsonb_build_object('deidentified', true),
      "updated_at" = v_now
    where "user_id" = v_target_uuid;
  get diagnostics v_push_count = row_count;

  update public."notifications"
    set
      "title" = case when "actor_user_id" = v_target_uuid then 'Deleted user activity' else "title" end,
      "body" = case when "actor_user_id" = v_target_uuid or "user_id" = v_target_uuid then null else "body" end,
      "target_context" = coalesce("target_context", '{}'::jsonb) || jsonb_build_object('deidentified', true),
      "status" = case when "user_id" = v_target_uuid then 'dismissed' else "status" end,
      "dismissed_at" = case when "user_id" = v_target_uuid then coalesce("dismissed_at", v_now) else "dismissed_at" end,
      "updated_at" = v_now
    where "user_id" = v_target_uuid or "actor_user_id" = v_target_uuid;
  get diagnostics v_notification_count = row_count;

  update public."account_deletion_requests"
    set
      "status" = 'completed',
      "processed_at" = v_now,
      "updated_at" = v_now,
      "metadata" = coalesce("metadata", '{}'::jsonb)
        || jsonb_build_object(
          'deidentifiedAt', v_now,
          'deidentificationProductionCapable', true,
          'deidentificationMode', 'single_user_operator',
          'providerRefundExecuted', false,
          'liveMoneyAction', false
        )
    where "id" = v_deletion."id";
  get diagnostics v_deletion_count = row_count;

  update auth.users
    set
      banned_until = 'infinity'::timestamptz,
      raw_user_meta_data = jsonb_build_object('deidentified', true),
      raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object('accountDeidentified', true)
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
    'admin_deidentify_deleted_account',
    'system',
    'auth_user',
    v_target,
    v_target,
    coalesce(v_reason, 'Controlled account purge/de-identification after restore window.'),
    'warning',
    jsonb_build_object(
      'status', 'scheduled',
      'restoreDeadline', v_deletion."restore_deadline",
      'deleteAfter', v_deletion."delete_after",
      'counts', v_counts
    ),
    jsonb_build_object(
      'status', 'completed',
      'profileRowsUpdated', v_profile_count,
      'pushTokensUpdated', v_push_count,
      'notificationsUpdated', v_notification_count,
      'deletionRowsUpdated', v_deletion_count
    ),
    jsonb_build_object(
      'source', 'account_purge_production_enablement',
      'mode', 'single_user_operator',
      'dryRun', false,
      'providerRefundExecuted', false,
      'liveMoneyAction', false,
      'legalAuditRecordsRetained', true
    )
  );

  return jsonb_build_object(
    'status', 'deidentified',
    'mutationPerformed', true,
    'mode', 'single_user_operator',
    'targetUserIdSuffix', right(v_target, 8),
    'profileRowsUpdated', v_profile_count,
    'pushTokensUpdated', v_push_count,
    'notificationsUpdated', v_notification_count,
    'deletionRowsUpdated', v_deletion_count,
    'retainedCategories', jsonb_build_array(
      'support_report_dmca',
      'admin_audit',
      'payment_provider_records',
      'abuse_security_logs',
      'content_references'
    ),
    'providerRefundExecuted', false,
    'liveMoneyAction', false
  );
end;
$$;

create or replace function public."admin_run_account_purge_batch"(
  p_dry_run boolean default true,
  p_limit integer default 10,
  p_enable boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor text := nullif((auth.uid())::text, '');
  v_config public."account_purge_runtime_config"%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 25);
  v_eligible_count integer := 0;
  v_suffixes text[];
begin
  if auth.role() <> 'service_role'
    and (v_actor is null or not public.has_platform_role(array['owner'::text, 'operator'::text]))
  then
    raise exception 'owner_or_operator_required';
  end if;

  select *
    into v_config
    from public."account_purge_runtime_config"
    where "id" is true;

  if coalesce(v_config."emergency_stop", true) then
    raise exception 'account_purge_disabled';
  end if;

  v_limit := least(v_limit, coalesce(v_config."max_batch_size", 10));

  with eligible as (
    select deletion."user_id"::text as user_id
    from public."account_deletion_requests" deletion
    join auth.users auth_user on auth_user.id = deletion."user_id"
    left join public."user_profiles" profile on profile."user_id" = deletion."user_id"::text
    where deletion."status" = 'scheduled'
      and coalesce(deletion."restore_deadline", deletion."delete_after") <= v_now
      and not exists (
        select 1
        from public."platform_role_memberships" membership
        where membership."status" = 'active'
          and (
            membership."user_id" = deletion."user_id"::text
            or lower(coalesce(membership."email", '')) = lower(coalesce(auth_user.email, ''))
          )
          and membership."role" in ('owner', 'operator', 'moderator')
      )
      and not exists (
        select 1
        from public."sandbox_monetization_testers" tester
        where tester."status" = 'active'
          and (tester."expires_at" is null or tester."expires_at" > v_now)
          and (
            tester."user_id" = deletion."user_id"::text
            or lower(coalesce(tester."email", '')) = lower(coalesce(auth_user.email, ''))
          )
      )
    order by deletion."delete_after" asc nulls last, deletion."requested_at" asc
  )
  select count(*), coalesce(array_agg(right(user_id, 8) order by user_id) filter (where user_id is not null), array[]::text[])
    into v_eligible_count, v_suffixes
    from (
      select user_id
      from eligible
      limit v_limit
    ) limited;

  if coalesce(p_dry_run, true) then
    return jsonb_build_object(
      'status', 'dry_run',
      'mutationPerformed', false,
      'batchEnabled', coalesce(v_config."batch_enabled", false),
      'explicitEnableProvided', coalesce(p_enable, false),
      'boundedLimit', v_limit,
      'eligibleCountWithinLimit', coalesce(v_eligible_count, 0),
      'targetSuffixes', coalesce(v_suffixes, array[]::text[]),
      'providerRefundExecuted', false,
      'liveMoneyAction', false
    );
  end if;

  if not coalesce(v_config."batch_enabled", false) or not coalesce(p_enable, false) then
    return jsonb_build_object(
      'status', 'batch_disabled',
      'mutationPerformed', false,
      'batchEnabled', coalesce(v_config."batch_enabled", false),
      'explicitEnableProvided', coalesce(p_enable, false),
      'boundedLimit', v_limit,
      'eligibleCountWithinLimit', coalesce(v_eligible_count, 0),
      'providerRefundExecuted', false,
      'liveMoneyAction', false
    );
  end if;

  raise exception 'batch_purge_not_implemented';
end;
$$;

revoke all on function public."admin_account_purge_runtime_status"() from public;
revoke all on function public."account_purge_deidentification_counts"(text) from public;
revoke all on function public."admin_deidentify_deleted_account"(text, text, boolean) from public;
revoke all on function public."admin_run_account_purge_batch"(boolean, integer, boolean) from public;

grant execute on function public."admin_account_purge_runtime_status"() to authenticated, service_role;
grant execute on function public."account_purge_deidentification_counts"(text) to service_role;
grant execute on function public."admin_deidentify_deleted_account"(text, text, boolean) to authenticated, service_role;
grant execute on function public."admin_run_account_purge_batch"(boolean, integer, boolean) to authenticated, service_role;

comment on table public."account_purge_runtime_config" is
  'Runtime stop/config table for controlled account purge. Batch purge remains disabled by default; no mobile client access.';

comment on function public."admin_deidentify_deleted_account"(text, text, boolean) is
  'Owner/operator controlled single-user account purge/de-identification RPC. Dry-run by default; requires expired scheduled deletion and denies protected accounts. Performs no provider refund or live-money action.';

comment on function public."admin_run_account_purge_batch"(boolean, integer, boolean) is
  'Owner/operator batch purge wrapper. Dry-run reports eligible counts; mutation is disabled unless runtime config and explicit call flag are enabled. Batch mutation is not implemented in this lane.';
