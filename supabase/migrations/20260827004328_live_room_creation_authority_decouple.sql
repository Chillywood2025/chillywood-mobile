-- Ordinary Live room creation is a communication capability, not a creator-money
-- or payout capability. Keep exact-current-session and exact-host authority,
-- while leaving creator monetization/KYC/tax/sanctions/payout checks on the
-- money capabilities that actually require them.
--
-- The historical function/trigger name is retained for migration stability.

create or replace function public."enforce_watch_party_live_creator_eligibility"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.role() = 'authenticated'
    and not public."whole_app_exact_current_session_authority_internal"()
  then
    raise exception using
      errcode = '28000',
      message = 'watch_party_current_session_required';
  end if;

  -- RLS already binds inserts/updates to auth.uid() = host_user_id. Preserve a
  -- trigger-level fail-closed host-substitution rejection as defense in depth.
  -- The legacy error message remains only for compatibility with the existing
  -- closure regression that exercises an attempted foreign-host insert.
  if auth.role() = 'authenticated'
    and auth.uid() is distinct from new."host_user_id"
  then
    raise exception using
      errcode = '42501',
      message = 'creator_eligibility_required';
  end if;

  return new;
end;
$function$;

comment on function public."enforce_watch_party_live_creator_eligibility"() is
  'Legacy trigger name retained for migration stability. Ordinary Live room creation requires an exact current authenticated session and exact host identity; creator monetization, KYC, tax, sanctions, and payout eligibility are not room-creation authority.';
