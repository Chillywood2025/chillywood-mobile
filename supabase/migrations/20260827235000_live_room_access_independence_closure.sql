-- PR 273 deliberately decoupled ordinary Live room creation from creator-money
-- eligibility. The later room-lifecycle closure reintroduced the money gate in
-- the shared membership resolver, so the newly-created host membership failed
-- in the same transaction for an otherwise valid ordinary Live host.
--
-- Keep paid Watch Parties on the existing exact ticket/creator-money path. Only
-- active Live rooms with no paid offer receive the ordinary Live path below.

-- The caller-bound block helper is also used by trusted table triggers. A
-- trigger executes inside its SECURITY DEFINER owner context, so a nested call
-- cannot recover the original SET ROLE provenance. Permit only a real trigger
-- invocation as internal authority; direct Data API calls still require exact
-- authenticated or dual-provenance service authority.
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
  v_trigger_authorized boolean := pg_catalog.pg_trigger_depth() > 0;
  v_auth_is_room_host boolean := false;
  v_blocked boolean := false;
begin
  begin
    v_request_role := nullif(auth.jwt() ->> 'role', '');
  exception
    when others then
      if not v_trigger_authorized then
        raise exception 'room_block_check_forbidden';
      end if;
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
    and not v_trigger_authorized
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
    join public."channel_audience_blocks" block_row
      on block_row."channel_user_id" = room."host_user_id"::text
     and block_row."blocked_user_id" = v_actor_user_id
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

alter function public."watch_party_room_self_access_allowed_internal"(text,text)
  rename to "watch_party_room_access_pre_live_decouple";
revoke all on function public."watch_party_room_access_pre_live_decouple"(text,text)
  from public, anon, authenticated, service_role;

create or replace function public."watch_party_room_self_access_allowed_internal"(
  p_party_id text,
  p_user_id text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_party_id text := pg_catalog.upper(
    pg_catalog.btrim(coalesce(p_party_id, ''))
  );
  v_user_id text := nullif(pg_catalog.btrim(coalesce(p_user_id, '')), '');
  v_auth_user_id text := nullif(auth.uid()::text, '');
  v_request_role text := coalesce(
    nullif(auth.role(), ''),
    nullif(pg_catalog.current_setting('role', true), ''),
    session_user::text
  );
  v_service_authority boolean := false;
  v_room public."watch_party_rooms"%rowtype;
begin
  if public."watch_party_room_access_pre_live_decouple"(
    p_party_id,
    p_user_id
  ) then
    return true;
  end if;

  if v_party_id = '' or v_user_id is null then
    return false;
  end if;

  select room.* into v_room
  from public."watch_party_rooms" room
  where room."party_id" = v_party_id;

  if v_room."party_id" is null
    or not coalesce(v_room."is_active", false)
    or v_room."room_type" <> 'live'
    or exists (
      select 1
      from public."paid_watch_party_offers" offer
      where offer."party_id" = v_party_id
        and offer."status" in (
          'sandbox', 'active', 'paused', 'sold_out', 'blocked'
        )
    )
  then
    return false;
  end if;

  v_service_authority := v_request_role = 'service_role'
    or (
      coalesce(auth.jwt() ->> 'role', '') not in ('authenticated', 'anon')
      and session_user::text in ('postgres', 'supabase_admin')
    );
  if not v_service_authority then
    if v_auth_user_id is null
      or v_auth_user_id not in (v_user_id, v_room."host_user_id"::text)
      or not public."whole_app_exact_current_session_authority_internal"()
    then
      return false;
    end if;
  end if;

  if public."is_account_access_restricted"(v_user_id)
    or public."is_account_access_restricted"(v_room."host_user_id"::text)
    or public."watch_party_room_actor_blocked_by_host"(
      v_party_id,
      v_user_id
    )
  then
    return false;
  end if;

  if v_room."host_user_id"::text = v_user_id then
    return v_room."content_access_rule" in ('open', 'party_pass', 'premium');
  elsif v_room."content_access_rule" = 'open' then
    return true;
  elsif v_room."content_access_rule" = 'party_pass' then
    return public."user_has_active_entitlement"(
      v_user_id,
      array['premium_watch_party'::text, 'premium'::text]
    );
  elsif v_room."content_access_rule" = 'premium' then
    return public."user_has_active_entitlement"(
      v_user_id,
      array['premium_live'::text, 'premium'::text]
    );
  end if;

  return false;
end;
$$;

revoke all on function public."watch_party_room_self_access_allowed_internal"(
  text, text
) from public, anon, authenticated, service_role;

comment on function public."watch_party_room_self_access_allowed_internal"(
  text, text
) is
  'Exact room admission. Paid Watch Parties retain provider-backed Seat authority; ordinary Live rooms require current session/account/room authority but never creator-money, KYC, tax, sanctions, or payout eligibility.';
