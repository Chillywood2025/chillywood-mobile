-- Correct the already-deployed room-host participant block-check without
-- rewriting migration 20260730161737. Classify the caller before inspecting
-- arguments or room state: authenticated callers require an exact subject,
-- while service authority requires both role provenances to be service_role.
--
-- SECURITY DEFINER changes current_user to the function owner, so current_user
-- is not caller evidence. current_setting('role') retains the PostgREST SET
-- ROLE provenance; when it is unset or "none", session_user is the only direct
-- session fallback. Request authority comes only from the signed full claims
-- document; a legacy single-claim GUC is not independent role authority.

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
  v_party_id text := pg_catalog.upper(
    nullif(pg_catalog.btrim(coalesce(p_party_id, '')), '')
  );
  v_actor_user_id text := nullif(
    pg_catalog.btrim(coalesce(p_actor_user_id, '')),
    ''
  );
  v_auth_user_id text;
  -- Do not replace this with current_user: SECURITY DEFINER owns current_user.
  v_configured_role text := nullif(
    pg_catalog.current_setting('role', true),
    ''
  );
  v_invoker_role text := case
    when v_configured_role is null or v_configured_role = 'none'
      then session_user::text
    else v_configured_role
  end;
  v_request_role text;
  v_authenticated_authorized boolean := false;
  v_service_role_authorized boolean := false;
  v_auth_is_room_host boolean := false;
  v_blocked boolean := false;
begin
  begin
    v_request_role := nullif(auth.jwt() ->> 'role', '');
  exception
    when others then
      raise exception 'room_block_check_forbidden';
  end;

  if v_invoker_role = 'service_role'
    and v_request_role = 'service_role'
  then
    v_service_role_authorized := true;
  elsif v_invoker_role = 'authenticated'
    and v_request_role = 'authenticated'
  then
    begin
      v_auth_user_id := nullif((auth.uid())::text, '');
    exception
      when others then
        raise exception 'room_block_check_forbidden';
    end;

    if v_auth_user_id is null then
      raise exception 'room_block_check_forbidden';
    end if;
    v_authenticated_authorized := true;
  end if;

  if not v_authenticated_authorized
    and not v_service_role_authorized
  then
    raise exception 'room_block_check_forbidden';
  end if;

  if v_authenticated_authorized
    and v_actor_user_id is distinct from v_auth_user_id
  then
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

  if v_party_id is null or v_actor_user_id is null then
    return false;
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
  from public, anon, authenticated, service_role;
grant execute on function
  public."watch_party_room_actor_blocked_by_host"(text, text)
  to authenticated, service_role;
