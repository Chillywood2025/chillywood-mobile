-- Wave 5.1 disabled/deactivated account access restrictions.
-- Centralizes scheduled-deletion/auth-suspension denial for private feature
-- writes and LiveKit/media token issuance. Safety, report, DMCA, and public
-- legal/support routes are intentionally not blocked by this migration.

set check_function_bodies = false;

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

  if public.is_account_deletion_scheduled(v_user_text) then
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

create or replace function public."assert_account_private_feature_allowed"(
  p_user_id text,
  p_feature text default 'private_feature'
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public."is_account_access_restricted"(p_user_id) then
    raise exception 'account_access_restricted';
  end if;
end;
$$;

revoke all on function public."assert_account_private_feature_allowed"(text, text) from public;
grant execute on function public."assert_account_private_feature_allowed"(text, text) to service_role;

create or replace function public."account_access_status_readback"(p_user_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_actor text := nullif((auth.uid())::text, '');
  v_target text := nullif(btrim(coalesce(p_user_id, '')), '');
  v_target_uuid uuid;
  v_banned_until timestamptz;
  v_deletion_scheduled boolean := false;
begin
  if v_target is null then
    raise exception 'target_user_required';
  end if;

  if auth.role() <> 'service_role'
    and v_actor <> v_target
    and not public.has_platform_role(array['owner'::text, 'operator'::text])
  then
    raise exception 'owner_or_operator_required';
  end if;

  begin
    v_target_uuid := v_target::uuid;
  exception
    when invalid_text_representation then
      raise exception 'invalid_target_user';
  end;

  select auth_user.banned_until
    into v_banned_until
    from auth.users auth_user
    where auth_user.id = v_target_uuid;

  if not found then
    raise exception 'target_user_not_found';
  end if;

  v_deletion_scheduled := public.is_account_deletion_scheduled(v_target);

  return jsonb_build_object(
    'userIdSuffix', right(v_target, 8),
    'restricted', public."is_account_access_restricted"(v_target),
    'scheduledDeletion', v_deletion_scheduled,
    'authSuspended', v_banned_until is not null and v_banned_until > timezone('utc'::text, now()),
    'bannedUntil', v_banned_until
  );
end;
$$;

revoke all on function public."account_access_status_readback"(text) from public;
grant execute on function public."account_access_status_readback"(text) to authenticated, service_role;

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
    raise exception 'cannot_suspend_self';
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
    coalesce(v_reason, 'Support/account safety suspension.'),
    'warning',
    jsonb_build_object('bannedUntil', v_before),
    jsonb_build_object('bannedUntil', v_after),
    jsonb_build_object(
      'source', 'wave5_1_account_lifecycle',
      'durationMinutes', v_minutes,
      'providerRefundExecuted', false,
      'liveMoneyAction', false
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

revoke all on function public."admin_suspend_account_for_support"(text, text, integer) from public;
grant execute on function public."admin_suspend_account_for_support"(text, text, integer) to authenticated, service_role;

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
    coalesce(v_reason, 'Support/account safety restore.'),
    'notice',
    jsonb_build_object('bannedUntil', v_before),
    jsonb_build_object('bannedUntil', null),
    jsonb_build_object(
      'source', 'wave5_1_account_lifecycle',
      'providerRefundExecuted', false,
      'liveMoneyAction', false
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

revoke all on function public."admin_restore_account_for_support"(text, text) from public;
grant execute on function public."admin_restore_account_for_support"(text, text) to authenticated, service_role;

create or replace function public."enforce_chat_threads_account_access_guard"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public."assert_account_private_feature_allowed"(new."created_by", 'chat_thread_create');
  return new;
end;
$$;

drop trigger if exists "enforce_chat_threads_account_access_guard" on public."chat_threads";
create trigger "enforce_chat_threads_account_access_guard"
  before insert on public."chat_threads"
  for each row execute function public."enforce_chat_threads_account_access_guard"();

revoke all on function public."enforce_chat_threads_account_access_guard"() from public;

create or replace function public."enforce_chat_thread_members_account_access_guard"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public."assert_account_private_feature_allowed"(new."user_id", 'chat_thread_membership');
  return new;
end;
$$;

drop trigger if exists "enforce_chat_thread_members_account_access_guard" on public."chat_thread_members";
create trigger "enforce_chat_thread_members_account_access_guard"
  before insert or update on public."chat_thread_members"
  for each row execute function public."enforce_chat_thread_members_account_access_guard"();

revoke all on function public."enforce_chat_thread_members_account_access_guard"() from public;

create or replace function public."enforce_chat_messages_abuse_guard"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_blocked boolean := false;
begin
  perform public."assert_account_private_feature_allowed"(new."sender_user_id", 'chat_message');

  new."body" := btrim(coalesce(new."body", ''));
  if char_length(new."body") < 1 then
    raise exception 'chat_message_body_required';
  end if;
  if char_length(new."body") > 1000 then
    raise exception 'chat_message_body_too_long';
  end if;

  select exists (
    select 1
    from public."chat_thread_members" other_member
    where other_member."thread_id" = new."thread_id"
      and other_member."user_id" <> new."sender_user_id"
      and public."has_channel_audience_block_between"(new."sender_user_id", other_member."user_id")
  ) into v_blocked;

  if coalesce(v_blocked, false) then
    raise exception 'blocked_relationship';
  end if;

  perform public."enforce_abuse_rate_limit"(
    new."sender_user_id",
    'chat_message',
    new."thread_id"::text,
    8,
    30,
    jsonb_build_object('source', 'chat_messages')
  );

  perform public."enforce_abuse_rate_limit"(
    new."sender_user_id",
    'chat_message_duplicate',
    new."thread_id"::text || ':' || md5(new."body"),
    2,
    60,
    jsonb_build_object('source', 'chat_messages')
  );

  return new;
end;
$$;

revoke all on function public."enforce_chat_messages_abuse_guard"() from public;

create or replace function public."enforce_chat_call_invites_abuse_guard"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public."assert_account_private_feature_allowed"(new."caller_user_id", 'chat_call_invite');
  perform public."assert_account_private_feature_allowed"(new."callee_user_id", 'chat_call_invite_recipient');

  if exists (
    select 1
    from public."chat_call_invites" invite
    where invite."thread_id" = new."thread_id"
      and invite."caller_user_id" = new."caller_user_id"
      and invite."callee_user_id" = new."callee_user_id"
      and invite."status" = 'ringing'
      and invite."expires_at" > timezone('utc'::text, now())
  ) then
    raise exception 'active_call_invite_exists';
  end if;

  perform public."enforce_abuse_rate_limit"(
    new."caller_user_id",
    'chat_call_invite',
    new."thread_id"::text || ':' || new."callee_user_id",
    3,
    300,
    jsonb_build_object('source', 'chat_call_invites', 'call_type', new."call_type")
  );

  return new;
end;
$$;

revoke all on function public."enforce_chat_call_invites_abuse_guard"() from public;

create or replace function public."enforce_communication_rooms_abuse_guard"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public."assert_account_private_feature_allowed"(new."host_user_id", 'communication_room_create');

  perform public."enforce_abuse_rate_limit"(
    new."host_user_id",
    'communication_room_create',
    coalesce(new."linked_party_id", 'direct_call'),
    5,
    600,
    jsonb_build_object('source', 'communication_rooms')
  );
  return new;
end;
$$;

revoke all on function public."enforce_communication_rooms_abuse_guard"() from public;

create or replace function public."enforce_communication_room_memberships_account_access_guard"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(new."membership_state", 'active')) in ('active', 'reconnecting') then
    perform public."assert_account_private_feature_allowed"(new."user_id", 'communication_room_membership');
  end if;
  return new;
end;
$$;

drop trigger if exists "enforce_communication_room_memberships_account_access_guard" on public."communication_room_memberships";
create trigger "enforce_communication_room_memberships_account_access_guard"
  before insert or update on public."communication_room_memberships"
  for each row execute function public."enforce_communication_room_memberships_account_access_guard"();

revoke all on function public."enforce_communication_room_memberships_account_access_guard"() from public;

create or replace function public."enforce_watch_party_rooms_abuse_guard"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public."assert_account_private_feature_allowed"(new."host_user_id"::text, 'watch_party_room_create');

  perform public."enforce_abuse_rate_limit"(
    new."host_user_id"::text,
    'watch_party_room_create',
    coalesce(new."room_type", 'unknown'),
    5,
    600,
    jsonb_build_object('source', 'watch_party_rooms')
  );
  return new;
end;
$$;

revoke all on function public."enforce_watch_party_rooms_abuse_guard"() from public;

create or replace function public."enforce_watch_party_room_membership_block_guard"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(new."membership_state", 'active')) in ('active', 'reconnecting') then
    perform public."assert_account_private_feature_allowed"(new."user_id", 'watch_party_room_membership');
  end if;

  if lower(coalesce(new."membership_state", 'active')) in ('active', 'reconnecting')
    and public."watch_party_room_actor_blocked_by_host"(new."party_id", new."user_id")
  then
    raise exception 'blocked_from_room';
  end if;

  return new;
end;
$$;

revoke all on function public."enforce_watch_party_room_membership_block_guard"() from public;

create or replace function public."enforce_watch_party_room_messages_abuse_guard"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public."assert_account_private_feature_allowed"(new."user_id", 'watch_party_room_message');

  new."text" := btrim(coalesce(new."text", ''));
  if char_length(new."text") < 1 then
    raise exception 'room_message_body_required';
  end if;
  if char_length(new."text") > 1000 then
    raise exception 'room_message_body_too_long';
  end if;

  if public."watch_party_room_actor_blocked_by_host"(new."party_id", new."user_id") then
    raise exception 'blocked_from_room';
  end if;

  if left(new."text", length('__chillywood_party_seat_request_v1__:')) = '__chillywood_party_seat_request_v1__:' then
    perform public."enforce_abuse_rate_limit"(
      new."user_id",
      'seat_request_marker',
      new."party_id",
      3,
      60,
      jsonb_build_object('source', 'watch_party_room_messages')
    );
  else
    perform public."enforce_abuse_rate_limit"(
      new."user_id",
      'room_message',
      new."party_id",
      10,
      30,
      jsonb_build_object('source', 'watch_party_room_messages')
    );
  end if;

  return new;
end;
$$;

revoke all on function public."enforce_watch_party_room_messages_abuse_guard"() from public;

create or replace function public."enforce_videos_account_access_guard"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public."assert_account_private_feature_allowed"(new."owner_id"::text, 'creator_video');
  return new;
end;
$$;

drop trigger if exists "enforce_videos_account_access_guard" on public."videos";
create trigger "enforce_videos_account_access_guard"
  before insert or update on public."videos"
  for each row execute function public."enforce_videos_account_access_guard"();

revoke all on function public."enforce_videos_account_access_guard"() from public;

create or replace function public."enforce_profile_posts_account_access_guard"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public."assert_account_private_feature_allowed"(new."user_id", 'profile_post');
  return new;
end;
$$;

drop trigger if exists "enforce_profile_posts_account_access_guard" on public."profile_posts";
create trigger "enforce_profile_posts_account_access_guard"
  before insert or update on public."profile_posts"
  for each row execute function public."enforce_profile_posts_account_access_guard"();

revoke all on function public."enforce_profile_posts_account_access_guard"() from public;

create or replace function public."enforce_creator_video_comments_abuse_guard"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public."assert_account_private_feature_allowed"(new."user_id", 'creator_video_comment');

  if exists (
    select 1
    from public."videos" video
    where video."id" = new."video_id"
      and public."has_channel_audience_block_between"(new."user_id", video."owner_id"::text)
  ) then
    raise exception 'blocked_relationship';
  end if;

  perform public."enforce_abuse_rate_limit"(
    new."user_id",
    'creator_video_comment',
    new."video_id"::text,
    5,
    60,
    jsonb_build_object('source', 'creator_video_comments', 'parent_comment_id', new."parent_comment_id")
  );

  perform public."enforce_abuse_rate_limit"(
    new."user_id",
    'creator_video_comment_duplicate',
    new."video_id"::text || ':' || md5(btrim(coalesce(new."body", ''))),
    2,
    120,
    jsonb_build_object('source', 'creator_video_comments')
  );

  return new;
end;
$$;

revoke all on function public."enforce_creator_video_comments_abuse_guard"() from public;

create or replace function public."enforce_profile_post_comments_abuse_guard"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public."assert_account_private_feature_allowed"(new."user_id", 'profile_post_comment');

  if exists (
    select 1
    from public."profile_posts" post
    where post."id" = new."post_id"
      and public."has_channel_audience_block_between"(new."user_id", post."user_id")
  ) then
    raise exception 'blocked_relationship';
  end if;

  perform public."enforce_abuse_rate_limit"(
    new."user_id",
    'profile_post_comment',
    new."post_id"::text,
    5,
    60,
    jsonb_build_object('source', 'profile_post_comments')
  );

  perform public."enforce_abuse_rate_limit"(
    new."user_id",
    'profile_post_comment_duplicate',
    new."post_id"::text || ':' || md5(btrim(coalesce(new."body", ''))),
    2,
    120,
    jsonb_build_object('source', 'profile_post_comments')
  );

  return new;
end;
$$;

revoke all on function public."enforce_profile_post_comments_abuse_guard"() from public;

comment on function public."is_account_access_restricted"(text) is
  'Wave 5.1 account lifecycle helper. Returns true for accounts with scheduled deletion or active auth suspension; used by private-feature write/token guards.';

comment on function public."admin_suspend_account_for_support"(text, text, integer) is
  'Owner/operator account support action. Temporarily sets auth.users.banned_until, writes immutable admin audit, and does not execute provider refunds or money actions.';

comment on function public."admin_restore_account_for_support"(text, text) is
  'Owner/operator account support action. Clears auth.users.banned_until, writes immutable admin audit, and does not execute provider refunds or money actions.';
