begin;
select plan(5);

select ok(
  position(
    'whole_app_exact_current_session_authority_internal'
    in pg_get_functiondef('public.enforce_watch_party_live_creator_eligibility()'::regprocedure)
  ) > 0,
  '1. Live room creation still requires exact current-session authority'
);

select ok(
  position(
    'wave1_creator_eligibility'
    in pg_get_functiondef('public.enforce_watch_party_live_creator_eligibility()'::regprocedure)
  ) = 0,
  '2. ordinary Live room creation is not coupled to creator eligibility records'
);

select ok(
  position('kyc_complete' in pg_get_functiondef('public.enforce_watch_party_live_creator_eligibility()'::regprocedure)) = 0
  and position('tax_complete' in pg_get_functiondef('public.enforce_watch_party_live_creator_eligibility()'::regprocedure)) = 0
  and position('sanctions_clear' in pg_get_functiondef('public.enforce_watch_party_live_creator_eligibility()'::regprocedure)) = 0
  and position('payout_eligible' in pg_get_functiondef('public.enforce_watch_party_live_creator_eligibility()'::regprocedure)) = 0,
  '3. KYC, tax, sanctions, and payout state do not gate ordinary Live room creation'
);

select ok(
  position(
    'auth.uid() is distinct from new."host_user_id"'
    in lower(pg_get_functiondef('public.enforce_watch_party_live_creator_eligibility()'::regprocedure))
  ) > 0,
  '4. foreign-host substitution still fails closed at the trigger boundary'
);

select is(
  (
    select trigger_state.tgenabled::text
    from pg_trigger trigger_state
    where trigger_state.tgrelid = 'public.watch_party_rooms'::regclass
      and trigger_state.tgname = 'enforce_watch_party_live_creator_eligibility'
      and not trigger_state.tgisinternal
  ),
  'O',
  '5. Live room authority trigger remains enabled'
);

select * from finish();
rollback;
