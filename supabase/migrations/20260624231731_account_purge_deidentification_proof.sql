-- Account purge / de-identification proof lane.
--
-- This migration intentionally does not add an automatic production purge job.
-- It keeps post-restore-window accounts fail-closed, then adds an
-- owner/operator-only proof RPC that can de-identify a dedicated disposable
-- proof account after scheduled deletion. It retains legal/support/audit/money
-- records and performs no provider refund or live-money action.

set check_function_bodies = false;

create or replace function public."account_deletion_public_hidden_reason"(p_user_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1
      from public."account_deletion_requests" deletion
      where deletion."user_id"::text = nullif(btrim(coalesce(p_user_id, '')), '')
        and deletion."status" = 'completed'
      limit 1
    ) then 'account_deletion_completed'
    when exists (
      select 1
      from public."account_deletion_requests" deletion
      where deletion."user_id"::text = nullif(btrim(coalesce(p_user_id, '')), '')
        and deletion."status" = 'scheduled'
      limit 1
    ) then 'account_deletion_scheduled'
    else null
  end;
$$;

revoke all on function public."account_deletion_public_hidden_reason"(text) from public;
grant execute on function public."account_deletion_public_hidden_reason"(text) to anon, authenticated, service_role;

create or replace function public."is_account_deletion_publicly_hidden"(p_user_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public."account_deletion_public_hidden_reason"(p_user_id) is not null;
$$;

revoke all on function public."is_account_deletion_publicly_hidden"(text) from public;
grant execute on function public."is_account_deletion_publicly_hidden"(text) to anon, authenticated, service_role;

create or replace function public."is_account_access_restricted"(p_user_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_user_text text := nullif(btrim(coalesce(p_user_id, '')), '');
  v_user_id uuid;
  v_auth_restricted boolean := false;
begin
  if v_user_text is null then
    return true;
  end if;

  if public."is_account_deletion_publicly_hidden"(v_user_text) then
    return true;
  end if;

  begin
    v_user_id := v_user_text::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;

  select exists (
    select 1
    from auth.users auth_user
    where auth_user.id = v_user_id
      and auth_user.banned_until is not null
      and auth_user.banned_until > timezone('utc'::text, now())
  ) into v_auth_restricted;

  return coalesce(v_auth_restricted, false);
end;
$$;

revoke all on function public."is_account_access_restricted"(text) from public;
grant execute on function public."is_account_access_restricted"(text) to anon, authenticated, service_role;

create or replace function public."resolve_profile_visibility_access"(
  profile_owner_id text,
  viewer_id text default (auth.uid())::text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner_user_id text := nullif(btrim(coalesce(profile_owner_id, '')), '');
  v_hidden_reason text;
begin
  if v_owner_user_id is null then
    return jsonb_build_object(
      'allowed', false,
      'visibility', 'public',
      'reason', 'not_found',
      'is_owner', false,
      'is_blocked', false,
      'is_circle_member', false,
      'is_subscriber', false,
      'is_follower', false,
      'viewer_user_id', nullif(btrim(coalesce(viewer_id, '')), ''),
      'owner_user_id', v_owner_user_id
    );
  end if;

  v_hidden_reason := public."account_deletion_public_hidden_reason"(v_owner_user_id);
  if v_hidden_reason is not null then
    return jsonb_build_object(
      'allowed', false,
      'visibility', 'private',
      'reason', v_hidden_reason,
      'is_owner', nullif(btrim(coalesce(viewer_id, '')), '') = v_owner_user_id,
      'is_blocked', false,
      'is_circle_member', false,
      'is_subscriber', false,
      'is_follower', false,
      'viewer_user_id', nullif(btrim(coalesce(viewer_id, '')), ''),
      'owner_user_id', v_owner_user_id
    );
  end if;

  return public."resolve_profile_platform_visibility_access"(v_owner_user_id, 'profile', viewer_id);
end;
$$;

create or replace function public."resolve_platform_visibility_access"(
  platform_owner_id text,
  viewer_id text default (auth.uid())::text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner_user_id text := nullif(btrim(coalesce(platform_owner_id, '')), '');
  v_hidden_reason text;
begin
  if v_owner_user_id is null then
    return jsonb_build_object(
      'allowed', false,
      'visibility', 'public',
      'reason', 'not_found',
      'is_owner', false,
      'is_blocked', false,
      'is_circle_member', false,
      'is_subscriber', false,
      'is_follower', false,
      'viewer_user_id', nullif(btrim(coalesce(viewer_id, '')), ''),
      'owner_user_id', v_owner_user_id
    );
  end if;

  v_hidden_reason := public."account_deletion_public_hidden_reason"(v_owner_user_id);
  if v_hidden_reason is not null then
    return jsonb_build_object(
      'allowed', false,
      'visibility', 'private',
      'reason', v_hidden_reason,
      'is_owner', nullif(btrim(coalesce(viewer_id, '')), '') = v_owner_user_id,
      'is_blocked', false,
      'is_circle_member', false,
      'is_subscriber', false,
      'is_follower', false,
      'viewer_user_id', nullif(btrim(coalesce(viewer_id, '')), ''),
      'owner_user_id', v_owner_user_id
    );
  end if;

  return public."resolve_profile_platform_visibility_access"(v_owner_user_id, 'platform', viewer_id);
end;
$$;

revoke all on function public."resolve_profile_visibility_access"(text, text) from public;
revoke all on function public."resolve_platform_visibility_access"(text, text) from public;
grant execute on function public."resolve_profile_visibility_access"(text, text) to anon, authenticated, postgres, service_role;
grant execute on function public."resolve_platform_visibility_access"(text, text) to anon, authenticated, postgres, service_role;

create or replace function public."admin_deidentify_deleted_account_for_proof"(
  p_target_user_id text,
  p_reason text default null,
  p_dry_run boolean default true,
  p_proof_override boolean default false
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
  v_deletion public."account_deletion_requests"%rowtype;
  v_is_proof_account boolean := false;
  v_is_protected_account boolean := false;
  v_restore_window_expired boolean := false;
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

  select lower(coalesce(auth_user.email, ''))
    into v_target_email
    from auth.users auth_user
    where auth_user.id = v_target_uuid;

  if not found then
    raise exception 'target_user_not_found';
  end if;

  if v_actor = v_target then
    raise exception 'cannot_deidentify_self';
  end if;

  select profile."username"
    into v_target_username
    from public."user_profiles" profile
    where profile."user_id" = v_target;

  v_is_proof_account :=
    coalesce(v_target_email, '') like '%@chillywood.test'
    and (
      coalesce(v_target_email, '') like '%purge%'
      or lower(coalesce(v_target_username, '')) like 'purgeproof%'
    );

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

  select *
    into v_deletion
    from public."account_deletion_requests" deletion
    where deletion."user_id" = v_target_uuid
      and deletion."status" = 'scheduled'
    order by deletion."requested_at" desc
    limit 1;

  if v_deletion."id" is null then
    raise exception 'scheduled_deletion_required';
  end if;

  v_restore_window_expired := coalesce(v_deletion."restore_deadline", v_deletion."delete_after") <= v_now;
  if not v_restore_window_expired and not (coalesce(p_proof_override, false) and v_is_proof_account) then
    raise exception 'restore_window_still_open';
  end if;

  if not v_is_proof_account then
    raise exception 'proof_account_required';
  end if;

  v_counts := jsonb_build_object(
    'profiles', (select count(*) from public."user_profiles" where "user_id" = v_target),
    'pushTokens', (select count(*) from public."user_push_tokens" where "user_id" = v_target),
    'notifications', (
      select count(*)
      from public."notifications"
      where "user_id" = v_target or "actor_user_id" = v_target
    ),
    'accountDeletionRequests', (
      select count(*)
      from public."account_deletion_requests"
      where "user_id" = v_target_uuid and "status" = 'scheduled'
    ),
    'chatMessages', (select count(*) from public."chat_messages" where "sender_user_id" = v_target),
    'communicationRoomsHosted', (select count(*) from public."communication_rooms" where "host_user_id" = v_target),
    'watchPartyRoomsHosted', (select count(*) from public."watch_party_rooms" where "host_user_id"::text = v_target),
    'creatorVideos', (select count(*) from public."videos" where "owner_id"::text = v_target),
    'creatorVideoComments', (select count(*) from public."creator_video_comments" where "user_id" = v_target),
    'profilePostComments', (select count(*) from public."profile_post_comments" where "user_id" = v_target),
    'safetyReports', (select count(*) from public."safety_reports" where "reporter_user_id" = v_target),
    'dmcaCases', (select count(*) from public."dmca_cases" where "reporter_user_id" = v_target),
    'adminAuditLogs', (select count(*) from public."platform_admin_audit_logs" where "target_user_id" = v_target or "actor_user_id" = v_target),
    'premiumEntitlements', (select count(*) from public."user_entitlements" where "user_id" = v_target)
  );

  if coalesce(p_dry_run, true) then
    return jsonb_build_object(
      'status', 'dry_run',
      'mutationPerformed', false,
      'targetUserIdSuffix', right(v_target, 8),
      'proofAccount', v_is_proof_account,
      'restoreWindowExpired', v_restore_window_expired,
      'proofOverrideUsed', coalesce(p_proof_override, false),
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
    where "user_id" = v_target;
  get diagnostics v_push_count = row_count;

  update public."notifications"
    set
      "title" = case when "actor_user_id" = v_target then 'Deleted user activity' else "title" end,
      "body" = case when "actor_user_id" = v_target or "user_id" = v_target then null else "body" end,
      "target_context" = coalesce("target_context", '{}'::jsonb) || jsonb_build_object('deidentified', true),
      "status" = case when "user_id" = v_target then 'dismissed' else "status" end,
      "dismissed_at" = case when "user_id" = v_target then coalesce("dismissed_at", v_now) else "dismissed_at" end,
      "updated_at" = v_now
    where "user_id" = v_target or "actor_user_id" = v_target;
  get diagnostics v_notification_count = row_count;

  update public."account_deletion_requests"
    set
      "status" = 'completed',
      "processed_at" = v_now,
      "updated_at" = v_now,
      "metadata" = coalesce("metadata", '{}'::jsonb)
        || jsonb_build_object(
          'deidentifiedAt', v_now,
          'deidentificationProofOnly', true,
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
    'admin_deidentify_deleted_account_for_proof',
    'system',
    'auth_user',
    v_target,
    v_target,
    coalesce(v_reason, 'Proof-only account purge/de-identification after restore window.'),
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
      'source', 'account_purge_deidentification_proof',
      'proofOnly', true,
      'proofOverrideUsed', coalesce(p_proof_override, false),
      'providerRefundExecuted', false,
      'liveMoneyAction', false,
      'legalAuditRecordsRetained', true
    )
  );

  return jsonb_build_object(
    'status', 'deidentified',
    'mutationPerformed', true,
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

revoke all on function public."admin_deidentify_deleted_account_for_proof"(text, text, boolean, boolean) from public;
grant execute on function public."admin_deidentify_deleted_account_for_proof"(text, text, boolean, boolean) to authenticated, service_role;

comment on function public."account_deletion_public_hidden_reason"(text) is
  'Returns a safe public-hidden reason for scheduled or completed account deletion states. Does not expose private account data.';

comment on function public."is_account_deletion_publicly_hidden"(text) is
  'Returns true when Profile/Platform should fail closed because account deletion is scheduled or completed.';

comment on function public."is_account_access_restricted"(text) is
  'Returns true for scheduled/completed deletion or active auth suspension; used by private-feature write/token guards.';

comment on function public."admin_deidentify_deleted_account_for_proof"(text, text, boolean, boolean) is
  'Owner/operator proof-only account de-identification RPC. Requires scheduled deletion and a disposable purge proof account; dry-run by default; retains legal/support/audit/payment records and performs no provider refund or live-money action.';
