-- Correct the already-deployed room-host participant block-check without
-- rewriting migration 20260730161737. Authenticated calls must have an exact
-- subject. A subject-less service call is allowed only when both the invoking
-- database role and the request claim are explicitly service_role.
--
-- SECURITY DEFINER changes current_user to the function owner, so current_user
-- is not caller evidence. current_setting('role') retains the PostgREST SET
-- ROLE provenance; when it is unset or "none", session_user is the only direct
-- session fallback. The signed full-claims role takes precedence over the
-- legacy request.jwt.claim.role setting.

create or replace function public."watch_party_room_actor_blocked_by_host"(
  p_party_id text,
  p_actor_user_id text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_party_id text := upper(nullif(btrim(coalesce(p_party_id, '')), ''));
  v_actor_user_id text := nullif(btrim(coalesce(p_actor_user_id, '')), '');
  v_auth_user_id text := nullif((auth.uid())::text, '');
  -- Do not replace this with current_user: SECURITY DEFINER owns current_user.
  v_configured_role text := nullif(current_setting('role', true), '');
  v_invoker_role text := case
    when v_configured_role is null or v_configured_role = 'none'
      then session_user::text
    else v_configured_role
  end;
  v_request_role text := coalesce(
    -- Prefer the signed full claims document; retain the legacy-role fallback.
    nullif(auth.jwt() ->> 'role', ''),
    nullif(current_setting('request.jwt.claim.role', true), '')
  );
  v_service_role_authorized boolean :=
    v_invoker_role = 'service_role'
    and v_request_role = 'service_role';
  v_auth_is_room_host boolean := false;
  v_blocked boolean := false;
begin
  if v_party_id is null or v_actor_user_id is null then
    return false;
  end if;

  if v_auth_user_id is null then
    if not v_service_role_authorized then
      raise exception 'room_block_check_forbidden';
    end if;
  elsif v_auth_user_id <> v_actor_user_id then
    select exists (
      select 1
      from public."watch_party_rooms" room
      where room."party_id" = v_party_id
        and room."host_user_id"::text = v_auth_user_id
    ) into v_auth_is_room_host;

    if not v_auth_is_room_host then
      raise exception 'room_block_check_forbidden';
    end if;
  end if;

  select exists (
    select 1
    from public."watch_party_rooms" room
    join public."channel_audience_blocks" block
      on block."channel_user_id" = room."host_user_id"::text
     and block."blocked_user_id" = v_actor_user_id
    where room."party_id" = v_party_id
      and room."host_user_id"::text <> v_actor_user_id
  ) into v_blocked;

  return coalesce(v_blocked, false);
end;
$$;

revoke all on function
  public."watch_party_room_actor_blocked_by_host"(text, text)
  from public, anon;
grant execute on function
  public."watch_party_room_actor_blocked_by_host"(text, text)
  to authenticated, service_role;
