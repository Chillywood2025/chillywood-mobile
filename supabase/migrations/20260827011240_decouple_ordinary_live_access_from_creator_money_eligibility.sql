-- Ordinary Live room access is a communication capability, not creator-money
-- or payout authority. Keep the paid-room branches strict, but remove the
-- blanket creator-money eligibility requirement that was incorrectly applied
-- to every Live room.

do $migration$
declare
  v_definition text;
  v_old text := $old$
  -- Creator eligibility is live authority, not a one-time room-creation
  -- receipt. Existing Live Stages also fail closed after eligibility changes.
  if v_room."room_type" = 'live' and not exists (
    select 1
    from public."wave1_creator_eligibility" eligibility
    where eligibility."creator_user_id"::text =
        v_room."host_user_id"::text
      and eligibility."state" = 'VERIFIED'
      and eligibility."account_status" = 'ACTIVE'
      and eligibility."age_18_plus"
      and eligibility."legal_accepted"
      and eligibility."creator_role"
      and eligibility."moderation_state" = 'CLEAR'
      and eligibility."market" = 'UNITED_STATES'
      and eligibility."rollout_eligible"
      and eligibility."platform_capability"
      and eligibility."provider_eligible"
      and eligibility."kyc_complete"
      and eligibility."tax_complete"
      and eligibility."sanctions_clear"
      and eligibility."payout_eligible"
  ) then
    return false;
  end if;
$old$;
  v_new text := $new$
  -- Ordinary Live room access is not creator-money or payout authority.
  -- Monetized paid-room branches below retain creator eligibility and provider
  -- proof requirements where money authority is actually involved.
$new$;
begin
  select pg_get_functiondef(
    'public.watch_party_room_self_access_allowed_internal(text,text)'::regprocedure
  ) into v_definition;

  if strpos(v_definition, v_old) = 0 then
    raise exception 'expected ordinary-live creator-money coupling block not found';
  end if;

  v_definition := replace(v_definition, v_old, v_new);
  execute v_definition;
end;
$migration$;

comment on function public.watch_party_room_self_access_allowed_internal(text,text) is
  'Caller-bound room access authority. Ordinary Live rooms require exact current session/account/block/access-rule authority but not creator-money KYC/tax/sanctions/payout eligibility; monetized paid rooms retain full provider and creator-money proof.';
