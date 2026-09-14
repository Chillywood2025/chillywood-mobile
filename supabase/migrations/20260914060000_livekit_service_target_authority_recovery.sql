-- Restore the service-only exact-target authority path used by host-managed
-- participant enforcement. The deployed predecessor still required a target
-- JWT session, which a trusted host-to-target enforcement call intentionally
-- does not possess. Ordinary token issuance keeps the predecessor unchanged.

alter function public."resolve_watch_party_livekit_authority_pre_live_rfgc"(
  text, uuid, uuid
) rename to "resolve_watch_party_livekit_authority_pre_service_fix";

create or replace function public."resolve_watch_party_livekit_authority_pre_live_rfgc"(
  p_party_id text,
  p_user_id uuid,
  p_session_generation uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_party_id text := upper(btrim(coalesce(p_party_id, '')));
  v_room public."watch_party_rooms"%rowtype;
  v_paid_required boolean := false;
  v_is_host boolean := false;
  v_has_fresh_membership boolean := false;
  v_allowed boolean := false;
  v_service_target_resolution boolean := p_session_generation is null
    and auth.role() = 'service_role';
begin
  if not v_service_target_resolution then
    return public."resolve_watch_party_livekit_authority_pre_service_fix"(
      p_party_id,
      p_user_id,
      p_session_generation
    );
  end if;

  select room.* into v_room
  from public."watch_party_rooms" room
  where room."party_id" = v_party_id;

  if p_user_id is null
    or v_party_id = ''
    or v_room."party_id" is null
    or not coalesce(v_room."is_active", false)
    or public."is_account_access_restricted"(p_user_id::text)
  then
    return jsonb_build_object(
      'allowed', false,
      'paidSeatRequired', false,
      'hostAuthority', false,
      'expiresAt', null,
      'reason', 'viewer_authority_invalid'
    );
  end if;

  select exists (
    select 1
    from public."paid_watch_party_offers" offer
    where offer."party_id" = v_party_id
      and offer."status" in (
        'sandbox', 'active', 'paused', 'sold_out', 'blocked'
      )
  ) into v_paid_required;
  v_is_host := v_room."host_user_id" = p_user_id;

  select exists (
    select 1
    from public."watch_party_room_memberships" membership
    where membership."party_id" = v_party_id
      and membership."user_id" = p_user_id::text
      and membership."membership_state" in ('active', 'reconnecting')
      and membership."left_at" is null
      and membership."last_seen_at" >= timezone('utc'::text, now()) - interval '45 seconds'
  ) into v_has_fresh_membership;

  if not v_has_fresh_membership then
    return jsonb_build_object(
      'allowed', false,
      'paidSeatRequired', v_paid_required,
      'hostAuthority', v_is_host,
      'expiresAt', null,
      'reason', 'room_viewer_authority_required'
    );
  end if;

  v_allowed := public."watch_party_room_self_access_allowed_internal"(
    v_party_id,
    p_user_id::text
  );
  if not v_allowed then
    return jsonb_build_object(
      'allowed', false,
      'paidSeatRequired', v_paid_required,
      'hostAuthority', v_is_host,
      'expiresAt', null,
      'reason', case
        when v_paid_required and v_is_host
          then 'paid_room_host_creator_authority_required'
        when v_paid_required
          then 'exact_paid_seat_authority_required'
        else 'room_viewer_authority_required'
      end
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'paidSeatRequired', v_paid_required,
    'hostAuthority', v_is_host,
    'expiresAt', null,
    'reason', case
      when v_paid_required and v_is_host then 'paid_room_host_authority'
      when v_paid_required then 'exact_paid_seat_viewer_authority'
      when v_is_host then 'non_seat_room_host_authority'
      else 'non_seat_room_authority'
    end
  );
end;
$$;

revoke all on function public."resolve_watch_party_livekit_authority_pre_service_fix"(
  text, uuid, uuid
) from public, anon, authenticated, service_role;
revoke all on function public."resolve_watch_party_livekit_authority_pre_live_rfgc"(
  text, uuid, uuid
) from public, anon, authenticated, service_role;

comment on function public."resolve_watch_party_livekit_authority_pre_live_rfgc"(
  text, uuid, uuid
) is
  'Composes the unchanged current-session resolver with a service-only exact-target path for host participant enforcement. The target path requires an active room, unrestricted exact user, fresh exact membership, and current room/payment authority; it grants no role by itself.';
