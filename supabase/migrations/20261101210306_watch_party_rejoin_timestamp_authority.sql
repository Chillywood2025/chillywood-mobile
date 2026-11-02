-- Preserve the actual admission RPC and every existing source/role check.
-- Fix only the conflict between its left-to-active timestamp reset and the
-- historical unconditional timestamp-immutability trigger. No grants broaden.
create or replace function public."enforce_watch_party_membership_identity"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host_user_id text;
  v_paid_ticket_required boolean := false;
  v_server_transition boolean :=
    coalesce(current_setting('app.watch_party_membership_authority', true), '') = 'server';
  v_configured_role text := nullif(current_setting('role', true), '');
  v_request_role text := nullif(auth.jwt() ->> 'role', '');
  v_service_transition boolean := false;
begin
  v_service_transition :=
    coalesce(v_configured_role, session_user::text) = 'service_role'
    and v_request_role = 'service_role';

  if tg_op = 'UPDATE' then
    if new."party_id" is distinct from old."party_id"
      or new."user_id" is distinct from old."user_id"

    then
      raise exception 'watch_party_membership_identity_immutable';
    end if;
    -- The canonical server-only join RPC intentionally starts a new attendance
    -- interval after a real leave. Identity is still immutable for active rows,
    -- removed rows, foreign actors and arbitrary timestamps. Direct table
    -- INSERT/UPDATE remains revoked with no client write RLS; the existing
    -- server-transition GUC is not a standalone client authorization grant.
    if new."joined_at" is distinct from old."joined_at" and not coalesce((
      v_server_transition
      and auth.uid() is not null
      and auth.uid()::text=new."user_id"
      and public.whole_app_exact_current_session_authority_internal()
      and old."membership_state"='left' and old."left_at" is not null
      and new."membership_state"='active' and new."left_at" is null
      and new."joined_at"=timezone('utc'::text,now())
      and new."joined_at">=old."joined_at"
    ),false) then
      raise exception 'watch_party_membership_identity_immutable';
    end if;
    if old."membership_state" = 'removed'
      and new."membership_state" <> 'removed'
    then
      raise exception 'watch_party_membership_removed';
    end if;
    if (
      new."role" is distinct from old."role"
      or new."stage_role" is distinct from old."stage_role"
      or new."can_speak" is distinct from old."can_speak"
      or new."host_muted" is distinct from old."host_muted"
      or new."self_muted" is distinct from old."self_muted"
      or new."membership_state" is distinct from old."membership_state"
    ) and not v_server_transition and not v_service_transition then
      raise exception 'watch_party_membership_authority_rpc_required';
    end if;
  end if;

  select room."host_user_id"::text into v_host_user_id
  from public."watch_party_rooms" room
  where room."party_id" = new."party_id";

  if v_host_user_id is null then
    raise exception 'watch_party_room_unavailable';
  end if;
  select exists (
    select 1
    from public."paid_watch_party_offers" offer
    where offer."party_id" = new."party_id"
      and offer."status" in (
        'sandbox', 'active', 'paused', 'sold_out', 'blocked'
      )
  ) into v_paid_ticket_required;
  if new."membership_state" in ('active', 'reconnecting')
    and not public."watch_party_room_self_access_allowed_internal"(
      new."party_id",
      new."user_id"
    )
  then
    raise exception 'watch_party_membership_access_required';
  end if;
  if new."user_id" = v_host_user_id then
    if new."role" <> 'host'
      or new."stage_role" <> 'host'
      or not new."can_speak"
      or new."host_muted"
    then
      raise exception 'watch_party_host_authority_invalid';
    end if;
  elsif new."role" <> 'viewer'
    or new."stage_role" not in ('listener', 'speaker')
    or new."can_speak" is distinct from (new."stage_role" = 'speaker')
  then
    raise exception 'watch_party_viewer_authority_invalid';
  end if;
  if v_paid_ticket_required
    and new."user_id" <> v_host_user_id
    and (
      new."role" <> 'viewer'
      or new."stage_role" <> 'listener'
      or new."can_speak"
      or new."camera_enabled"
      or new."mic_enabled"
    )
  then
    raise exception 'paid_watch_party_viewer_only';
  end if;

  new."is_muted" := new."host_muted" or new."self_muted";
  if new."membership_state" not in ('active', 'reconnecting', 'left', 'removed') then
    raise exception 'watch_party_membership_state_invalid';
  end if;
  if new."membership_state" in ('left', 'removed')
    or new."is_muted"
    or not new."can_speak"
  then
    new."camera_enabled" := false;
    new."mic_enabled" := false;
  end if;

  return new;
end;
$$;

revoke all on function public."enforce_watch_party_membership_identity"()
  from public, anon, authenticated;
