-- A terminal Chat invite closes ordinary room visibility before the client
-- finishes its local media teardown. Self-leave must confirm the actual durable
-- row without reopening room reads or guessing that an invisible row is gone.
alter table public.communication_room_memberships
  add column membership_generation uuid not null default gen_random_uuid();

-- A repeated join of the same active membership remains idempotent. Admission
-- after a completed leave creates a new generation, even though joined_at is
-- intentionally historical and unchanged. The existing join/identity guards
-- continue to own whether the state transition is permitted.
create function public.advance_communication_membership_generation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.membership_state = 'left'
    and new.membership_state in ('active', 'reconnecting') then
    new.membership_generation := gen_random_uuid();
  elsif new.membership_generation is distinct from old.membership_generation then
    raise exception 'communication_membership_generation_immutable';
  end if;
  return new;
end;
$$;
revoke all on function public.advance_communication_membership_generation()
  from public, anon, authenticated, service_role;
-- PostgreSQL orders same-kind triggers by name. Rotate only after the identity
-- and ended-room guards have settled NEW; a rejected stale reactivation must
-- not invalidate the existing terminal generation.
create trigger zz_advance_communication_membership_generation
before update on public.communication_room_memberships
for each row execute function public.advance_communication_membership_generation();

create function public.leave_communication_room_session(
  p_room_id text,
  p_expected_membership_generation uuid
)
returns setof public.communication_room_memberships
language plpgsql security definer set search_path = '' as $$
declare
  v_actor text := nullif(auth.uid()::text, '');
  v_room_id text := upper(btrim(coalesce(p_room_id, '')));
  v_room public.communication_rooms%rowtype;
  v_membership public.communication_room_memberships%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if v_actor is null
    or not public.whole_app_exact_current_session_authority_internal() then
    raise exception 'communication_room_current_session_required';
  end if;
  if v_room_id = '' or v_room_id !~ '^[A-Z0-9_-]{4,128}$'
    or p_expected_membership_generation is null then
    raise exception 'communication_membership_cleanup_identity_required';
  end if;

  -- Same lock order as join and terminal cleanup: room, then membership.
  select room.* into v_room from public.communication_rooms room
  where room.room_id = v_room_id for update;
  if v_room.room_id is null then
    raise exception 'communication_membership_cleanup_not_found';
  end if;
  select membership.* into v_membership
  from public.communication_room_memberships membership
  where membership.room_id = v_room_id and membership.user_id = v_actor
  for update;
  if v_membership.user_id is null then
    raise exception 'communication_membership_cleanup_not_found';
  end if;
  if v_membership.membership_generation is distinct from p_expected_membership_generation then
    raise exception 'communication_membership_cleanup_generation_changed';
  end if;
  if v_membership.role <> (case when v_room.host_user_id = v_actor then 'host' else 'participant' end) then
    raise exception 'communication_membership_role_invalid';
  end if;

  -- Cleanup only reduces this authenticated actor's existing authority. A
  -- terminal room cannot pass the normal read gate; returning this one own row
  -- deliberately does not expose its peers, linked room, or private content.
  if v_membership.membership_state in ('left', 'removed') then
    if v_membership.camera_enabled or v_membership.mic_enabled
      or v_membership.left_at is null then
      raise exception 'communication_membership_cleanup_postcondition_failed';
    end if;
    return next v_membership;
    return;
  end if;
  if v_membership.membership_state not in ('active', 'reconnecting') then
    raise exception 'communication_membership_cleanup_state_invalid';
  end if;
  update public.communication_room_memberships membership
  set membership_state = 'left', camera_enabled = false, mic_enabled = false,
      last_seen_at = v_now, updated_at = v_now, left_at = v_now
  where membership.room_id = v_room_id and membership.user_id = v_actor
    and membership.membership_generation = p_expected_membership_generation
  returning membership.* into v_membership;
  if v_membership.user_id is null
    or v_membership.membership_state <> 'left'
    or v_membership.camera_enabled or v_membership.mic_enabled
    or v_membership.left_at is null then
    raise exception 'communication_membership_cleanup_postcondition_failed';
  end if;
  return next v_membership;
end;
$$;
revoke all on function public.leave_communication_room_session(text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.leave_communication_room_session(text, uuid)
  to authenticated;
comment on function public.leave_communication_room_session(text, uuid) is
  'Exact-current-session self cleanup; confirms one existing membership generation after terminal room visibility closes. No room discovery or peer read authority.';
