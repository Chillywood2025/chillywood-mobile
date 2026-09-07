-- Restore the exact Party Room free-entry default that was lost when provider
-- identity hardening replaced the ticket resolver. This is a display/admission
-- classification repair only: paid rooms still delegate to the hardened
-- provider, buyer, creator, target, reversal and historical-grant authority.

alter function public."resolve_paid_watch_party_ticket_access"(text)
  rename to "resolve_paid_watch_party_ticket_access_pre_free_default";
revoke all on function public."resolve_paid_watch_party_ticket_access_pre_free_default"(text)
  from public,anon,authenticated,service_role;

create or replace function public."resolve_paid_watch_party_ticket_access"(
  p_party_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_room public."watch_party_rooms"%rowtype;
begin
  select room.* into v_room
  from public."watch_party_rooms" room
  where room."party_id"=p_party_id;

  if v_room."party_id" is not null
    and coalesce(v_room."is_active",false)
    and v_room."room_type"='title'
    and not exists (
      select 1
      from public."paid_watch_party_offers" offer
      where offer."party_id"=v_room."party_id"
        and offer."status" in ('sandbox','active','paused','sold_out','blocked')
    )
  then
    if v_user is null then
      return jsonb_build_object(
        'allowed',false,
        'reason','auth_required',
        'requiresPurchase',false
      );
    end if;
    if not public."wave1_current_caller_authority_internal"() then
      return jsonb_build_object(
        'allowed',false,
        'reason','session_authority_not_current',
        'requiresPurchase',false
      );
    end if;
    if public."is_account_access_restricted"(v_user::text) then
      return jsonb_build_object(
        'allowed',false,
        'reason','account_restricted',
        'requiresPurchase',false
      );
    end if;
    if public."watch_party_room_actor_blocked_by_host"(
      p_party_id,v_user::text
    ) then
      return jsonb_build_object(
        'allowed',false,
        'reason','blocked_by_host',
        'requiresPurchase',false
      );
    end if;
    return jsonb_build_object(
      'allowed',true,
      'reason','free_room',
      'requiresPurchase',false
    );
  end if;

  return public."resolve_paid_watch_party_ticket_access_pre_free_default"(
    p_party_id
  );
end;
$$;

revoke all on function public."resolve_paid_watch_party_ticket_access"(text)
  from public,anon,authenticated,service_role;
grant execute on function public."resolve_paid_watch_party_ticket_access"(text)
  to authenticated,service_role;

comment on function public."resolve_paid_watch_party_ticket_access"(text) is
  'Returns free_room only for one exact active title room with no current paid offer; every paid or historical path delegates unchanged to hardened exact-ticket authority.';
