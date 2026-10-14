-- Forward-only repair. Existing deployed migrations and paid-seat authorities
-- remain unchanged. No table grants, RLS policies, or public entitlement RPCs
-- are expanded. Apply only through the separately authorized database workflow.
begin;

create or replace function public."enforce_watch_party_room_membership_authority_closeout_internal"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_request_role text := auth.role();
  v_host uuid;
  v_paid_required boolean:=false;
  v_existing public."watch_party_room_memberships"%rowtype;
begin
  if v_request_role = 'service_role' then
    return new;
  end if;
  select room."host_user_id" into v_host
  from public."watch_party_rooms" room
  where room."party_id" = new."party_id";
  if v_actor is null then raise exception 'room_membership_auth_required'; end if;
  if v_actor = v_host then
    if new."user_id"=v_actor::text then
      if new."membership_state" in ('active','reconnecting')
        and not public."watch_party_room_self_access_allowed_internal"(
          new."party_id",new."user_id"
        )
      then
        raise exception 'paid_room_host_creator_authority_required';
      end if;
      return new;
    end if;
    select exists (
      select 1 from public."paid_watch_party_offers" offer
      where offer."party_id"=new."party_id"
        and offer."status" in ('sandbox','active','paused','sold_out','blocked')
    ) into v_paid_required;
    if not v_paid_required then return new; end if;
    if new."membership_state" in ('active','reconnecting')
      and not public."watch_party_room_self_access_allowed_internal"(
        new."party_id",new."user_id"
      )
    then
      raise exception 'paid_room_host_membership_access_required';
    end if;
    if new."role"<>'viewer' or new."stage_role"<>'listener'
      or new."can_speak" or new."camera_enabled" or new."mic_enabled"
    then
      raise exception 'paid_room_host_membership_escalation_forbidden';
    end if;
    return new;
  end if;
  if new."user_id" <> v_actor::text then raise exception 'room_membership_identity_mismatch'; end if;

  if new."membership_state" in ('active','reconnecting')
    and not public."watch_party_room_self_access_allowed_internal"(new."party_id", new."user_id")
  then
    raise exception 'room_membership_access_required';
  end if;
  -- The canonical self RPC may retain approval, never create it. The INSERT
  -- half of join's UPSERT runs before its UPDATE half, so inspect the existing
  -- exact row for both operations instead of trusting the server GUC alone.
  if coalesce(current_setting('app.watch_party_membership_authority', true), '') = 'server'
    and public."whole_app_exact_current_session_authority_internal"()
    and new."role" = 'viewer' and new."stage_role" = 'speaker' and new."can_speak"
    and new."membership_state" in ('active', 'reconnecting', 'left')
    and not exists (
      select 1 from public."paid_watch_party_offers" offer
      where offer."party_id" = new."party_id"
        and offer."status" in ('sandbox','active','paused','sold_out','blocked')
    )
  then
    if tg_op = 'UPDATE' then
      v_existing := old;
    else
      select membership.* into v_existing
      from public."watch_party_room_memberships" membership
      where membership."party_id" = new."party_id"
        and membership."user_id" = new."user_id";
    end if;
    if v_existing."party_id" = new."party_id"
      and v_existing."user_id" = v_actor::text
      and v_existing."role" = 'viewer'
      and v_existing."stage_role" = 'speaker' and v_existing."can_speak"
      and v_existing."host_muted" is not distinct from new."host_muted"
      and (
        v_existing."membership_state" in ('active', 'reconnecting')
        or (v_existing."membership_state" = 'left' and new."membership_state" = 'left')
      )
      and (
        tg_op = 'UPDATE'
        or (
          new."membership_state" = 'active' and v_existing."left_at" is null
          and v_existing."last_seen_at" >= now() - interval '45 seconds'
        )
      )
      and (
        (new."membership_state" <> 'left' and not new."host_muted" and not new."self_muted")
        or (not new."camera_enabled" and not new."mic_enabled")
      )
    then
      return new;
    end if;
  end if;
  if new."role" <> 'viewer'
    or new."stage_role" <> 'listener'
    or new."can_speak"
    or new."camera_enabled"
    or new."mic_enabled"
  then
    raise exception 'room_membership_self_escalation_forbidden';
  end if;
  return new;
end;
$$;
revoke all on function public."enforce_watch_party_room_membership_authority_closeout_internal"()
  from public, anon, authenticated, service_role;

-- Service-only LiveKit resolution already supplies an exact target session,
-- and host moderation already binds the exact host. The ordinary Live fallback
-- must consume internal target Premium authority, not a caller-JWT-only public
-- RPC. Preserve the paid predecessor and every existing caller/account/block
-- guard; this change neither invents a paid pass nor grants speaker approval.
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
    return public."premium_subject_has_finite_authority_internal"(v_user_id);
  elsif v_room."content_access_rule" = 'premium' then
    return public."premium_subject_has_finite_authority_internal"(v_user_id);
  end if;

  return false;
end;
$$;
revoke all on function public."watch_party_room_self_access_allowed_internal"(text, text)
  from public, anon, authenticated, service_role;

commit;
