begin;
select no_plan();

-- This fixture keeps the JWT evidence structurally current while varying only
-- the authoritative auth.sessions row.  The shared readback must use the
-- database clock and must never accept a caller-supplied expiry projection.
insert into auth.users (
  id,
  email,
  email_confirmed_at,
  is_sso_user,
  is_anonymous
) values
  (
    '97000000-0000-4000-8000-000000000001',
    'session-timebox-subject@example.test',
    now(),
    false,
    false
  ),
  (
    '97000000-0000-4000-8000-000000000002',
    'session-timebox-other@example.test',
    now(),
    false,
    false
  );

insert into auth.sessions (id, user_id, not_after)
values
  (
    '98000000-0000-4000-8000-000000000001',
    '97000000-0000-4000-8000-000000000001',
    null
  ),
  (
    '98000000-0000-4000-8000-000000000002',
    '97000000-0000-4000-8000-000000000002',
    now() + interval '1 day'
  );

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role', 'authenticated',
    'sub', '97000000-0000-4000-8000-000000000001',
    'session_id', '98000000-0000-4000-8000-000000000001',
    'exp', 4070908800
  )::text,
  true
);

select is(
  to_regprocedure('public.wave1_session_authority_readback()') is not null,
  true,
  'the shared exact-current-session authority root exists'
);

select is(
  pg_get_function_identity_arguments(
    'public.wave1_session_authority_readback()'::regprocedure
  ),
  '',
  'the root accepts no caller-controlled identity, generation, time, or expiry arguments'
);

select ok(
  (
    select procedure.prosecdef
      and procedure.provolatile = 's'
      and procedure.proconfig = array['search_path=""']::text[]
    from pg_proc procedure
    where procedure.oid = 'public.wave1_session_authority_readback()'::regprocedure
  ),
  'the root remains STABLE SECURITY DEFINER with an empty fixed search_path'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.wave1_session_authority_readback()',
    'EXECUTE'
  ),
  'authenticated callers retain only the intended readback execution grant'
);

select ok(
  not has_function_privilege(
    'public',
    'public.wave1_session_authority_readback()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.wave1_session_authority_readback()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.wave1_session_authority_readback()',
    'EXECUTE'
  ),
  'PUBLIC, anon, and service_role cannot invoke the user-session authority root'
);

select ok(
  not has_table_privilege('authenticated', 'auth.sessions', 'SELECT')
  and not has_table_privilege('authenticated', 'auth.sessions', 'INSERT')
  and not has_table_privilege('authenticated', 'auth.sessions', 'UPDATE')
  and not has_table_privilege('authenticated', 'auth.sessions', 'DELETE'),
  'the fix does not expose or make auth.sessions mutable to normal clients'
);

select ok(
  lower(pg_get_functiondef(
    'public.wave1_session_authority_readback()'::regprocedure
  )) like '%session_row.not_after is null%'
  and lower(pg_get_functiondef(
    'public.wave1_session_authority_readback()'::regprocedure
  )) like '%session_row.not_after > now()%'
  and lower(pg_get_functiondef(
    'public.wave1_session_authority_readback()'::regprocedure
  )) not like '%p_not_after%'
  and lower(pg_get_functiondef(
    'public.wave1_session_authority_readback()'::regprocedure
  )) not like '%request.jwt.claim.not_after%'
  and lower(pg_get_functiondef(
    'public.wave1_session_authority_readback()'::regprocedure
  )) not like '%request.jwt.claims.not_after%',
  'only the authoritative row cutoff and database clock control time-box authority'
);

select is(
  (
    select count(*)::integer
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prokind = 'f'
      and procedure.proname <> 'wave1_session_authority_readback'
      and pg_get_functiondef(procedure.oid) like '%wave1_session_authority_readback%'
  ),
  25,
  'all twenty-five direct SQL consumers inherit the one shared root correction'
);

select is(
  (
    select array_agg(procedure.proname::text order by procedure.proname)
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prokind = 'f'
      and procedure.proname <> 'wave1_session_authority_readback'
      and pg_get_functiondef(procedure.oid) like '%wave1_session_authority_readback%'
  ),
  array[
    'create_channel_subscription_intent_pre_source_lock',
    'create_creator_payout_request_safe',
    'create_event_pass_intent_pre_source_lock',
    'create_ios_app_store_intent_pre_source_lock',
    'create_ios_creator_money_intent_pre_source_lock',
    'create_ios_creator_money_purchase_intent_pre_protected_video_cl',
    'create_ios_creator_money_purchase_intent_pre_specialized_routin',
    'create_ios_paid_video_purchase_intent_guard_internal',
    'create_money_purchase_intent_pre_protected_video_closeout',
    'create_money_purchase_intent_pre_source_lock',
    'create_vip_pass_intent_pre_source_lock',
    'creator_video_paid_precharge_authority_internal',
    'platform_exact_current_session_authority_internal',
    'wave1_accept_legal_documents',
    'wave1_accept_legal_documents_pre_integrity_closeout',
    'wave1_assert_current_creator_money_authority_internal',
    'wave1_creator_eligibility_readback',
    'wave1_current_caller_authority_internal',
    'wave1_entitlement_authority_readback',
    'wave1_legal_requirements_readback',
    'wave1_push_ownership_readback',
    'wave1_register_push_token',
    'whole_app_exact_current_session_authority_internal',
    'whole_app_ios_voip_push_readback',
    'whole_app_register_ios_voip_push_token'
  ]::text[],
  'the inventoried legal, entitlement, creator, push, room, VoIP, and staff consumers all converge on the corrected root'
);

-- L: a nullable cutoff is the provider-defined ordinary non-time-boxed state.
select is(
  public.wave1_session_authority_readback() ->> 'state',
  'ACTIVE',
  'an otherwise valid session with null not_after remains active'
);

-- A: a future authoritative cutoff may continue only while every other gate passes.
update auth.sessions
set not_after = now() + interval '1 hour'
where id = '98000000-0000-4000-8000-000000000001';

select is(
  public.wave1_session_authority_readback() ->> 'state',
  'ACTIVE',
  'a valid exact session with future not_after remains active'
);

select ok(
  public.platform_exact_current_session_authority_internal(),
  'an unexpired confirmed staff subject remains eligible for downstream exact-session checks'
);

-- B/C: the JWT remains unexpired, but the authoritative row time box is past.
update auth.sessions
set not_after = now() - interval '1 second'
where id = '98000000-0000-4000-8000-000000000001';

select is(
  public.wave1_session_authority_readback() ->> 'state',
  'TERMINATED',
  'a retained session with past not_after is denied while its JWT remains unexpired'
);

select ok(
  not public.platform_exact_current_session_authority_internal(),
  'a privileged staff session loses authority when its row time box expires'
);

-- D/O: a privileged SECURITY DEFINER creator-money mutation must stop before
-- it can manufacture authority evidence.
select throws_ok(
  $$
    select public.wave1_accept_legal_documents(
      '{}'::jsonb,
      'UNITED_STATES',
      '97000000-0000-4000-8000-000000000001',
      '97000000-0000-4000-8000-000000000001',
      '98000000-0000-4000-8000-000000000001',
      'creator_money'
    )
  $$,
  'P0001',
  'account_access_restricted',
  'an expired session is denied before a creator-money legal-authority mutation'
);

select is(
  (
    select count(*)::integer
    from public.wave1_legal_acceptances
    where user_id = '97000000-0000-4000-8000-000000000001'
  ),
  0,
  'the denied privileged mutation writes no legal-acceptance authority row'
);

-- A live service-capable push mutation is similarly stopped at the shared root.
select throws_ok(
  $$
    select public.wave1_register_push_token(
      '97000000-0000-4000-8000-000000000001',
      '97000000-0000-4000-8000-000000000001',
      '98000000-0000-4000-8000-000000000001',
      'android',
      'fcm',
      'expired-session-install',
      'expired-session-token',
      repeat('a', 64),
      'expired-session-registration',
      'granted',
      '1.0.0',
      '1',
      '{}'::jsonb
    )
  $$,
  'P0001',
  'push_session_binding_mismatch',
  'an expired user session is denied before privileged push-token mutation'
);

select ok(
  not exists (
    select 1
    from public.wave1_push_installation_ownership
    where install_id = 'expired-session-install'
  )
  and not exists (
    select 1
    from public.user_push_tokens
    where install_id = 'expired-session-install'
  ),
  'the denied privileged push path performs no service-authoritative write'
);

-- E: an exact generation belonging to another user never binds this subject.
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role', 'authenticated',
    'sub', '97000000-0000-4000-8000-000000000001',
    'session_id', '98000000-0000-4000-8000-000000000002',
    'exp', 4070908800
  )::text,
  true
);

select is(
  public.wave1_session_authority_readback() ->> 'state',
  'TERMINATED',
  'an exact session id bound to the wrong user is denied'
);

-- F/G: another live row cannot rescue a stale or absent bearer generation.
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role', 'authenticated',
    'sub', '97000000-0000-4000-8000-000000000001',
    'session_id', '98000000-0000-4000-8000-000000000099',
    'exp', 4070908800
  )::text,
  true
);

select is(
  public.wave1_session_authority_readback() ->> 'state',
  'TERMINATED',
  'a correct user with a stale session generation is denied'
);

select ok(
  not exists (
    select 1
    from auth.sessions
    where id = '98000000-0000-4000-8000-000000000099'
  )
  and public.wave1_session_authority_readback() ->> 'state' = 'TERMINATED',
  'a missing auth.sessions row cannot grant authority'
);

-- H: Supabase session revocation is row deletion; a formerly valid bearer
-- becomes non-authoritative even while its JWT evidence remains present.
insert into auth.sessions (id, user_id, not_after)
values (
  '98000000-0000-4000-8000-000000000003',
  '97000000-0000-4000-8000-000000000001',
  now() + interval '1 hour'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role', 'authenticated',
    'sub', '97000000-0000-4000-8000-000000000001',
    'session_id', '98000000-0000-4000-8000-000000000003',
    'exp', 4070908800
  )::text,
  true
);

select is(
  public.wave1_session_authority_readback() ->> 'state',
  'ACTIVE',
  'the revocation fixture starts as an exact unexpired session'
);

delete from auth.sessions
where id = '98000000-0000-4000-8000-000000000003';

select is(
  public.wave1_session_authority_readback() ->> 'state',
  'TERMINATED',
  'deleting the authoritative session row revokes the retained bearer'
);

-- I: unexpected generation evidence is non-authoritative, while malformed
-- cutoff storage is rejected by the provider schema itself.
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role', 'authenticated',
    'sub', '97000000-0000-4000-8000-000000000001',
    'session_id', 'malformed-session-generation',
    'exp', 4070908800
  )::text,
  true
);

select is(
  public.wave1_session_authority_readback() ->> 'state',
  'TERMINATED',
  'a malformed session generation fails closed without an identity cast'
);

select is(
  (
    select data_type
    from information_schema.columns
    where table_schema = 'auth'
      and table_name = 'sessions'
      and column_name = 'not_after'
  ),
  'timestamp with time zone',
  'the authoritative expiry is a timezone-aware database type'
);

select throws_ok(
  $$select 'malformed-not-after'::timestamptz$$,
  '22007',
  'invalid input syntax for type timestamp with time zone: "malformed-not-after"',
  'malformed authoritative expiry state cannot be stored or interpreted as valid'
);

-- J: equality is deliberately fail-closed at the exact database-clock boundary.
update auth.sessions
set not_after = now()
where id = '98000000-0000-4000-8000-000000000001';

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role', 'authenticated',
    'sub', '97000000-0000-4000-8000-000000000001',
    'session_id', '98000000-0000-4000-8000-000000000001',
    'exp', 4070908800
  )::text,
  true
);

select is(
  public.wave1_session_authority_readback() ->> 'state',
  'TERMINATED',
  'not_after equal to the database transaction clock is denied deterministically'
);

-- K: a future cutoff never overrides another failed authority condition.
update auth.sessions
set not_after = now() + interval '1 hour'
where id = '98000000-0000-4000-8000-000000000001';

update auth.users
set banned_until = now() + interval '1 hour'
where id = '97000000-0000-4000-8000-000000000001';

select is(
  public.wave1_session_authority_readback() ->> 'state',
  'TERMINATED',
  'future not_after cannot override an unrelated account-authority restriction'
);

update auth.users
set banned_until = null
where id = '97000000-0000-4000-8000-000000000001';

select is(
  public.wave1_session_authority_readback() ->> 'state',
  'ACTIVE',
  'lifting the unrelated restriction preserves intended unexpired-session behavior'
);

-- M/N: caller-projected time and cached state are inert.  The database row is
-- expired again while the attacker claims a future cutoff and ACTIVE state.
update auth.sessions
set not_after = now() - interval '1 second'
where id = '98000000-0000-4000-8000-000000000001';

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role', 'authenticated',
    'sub', '97000000-0000-4000-8000-000000000001',
    'session_id', '98000000-0000-4000-8000-000000000001',
    'exp', 4070908800,
    'not_after', '2099-01-01T00:00:00Z',
    'authoritative', true,
    'state', 'ACTIVE',
    'restoreOnly', false
  )::text,
  true
);

select is(
  public.wave1_session_authority_readback() ->> 'state',
  'TERMINATED',
  'an attacker-supplied client timestamp cannot extend server session authority'
);

select ok(
  public.wave1_session_authority_readback() ->> 'state' <> (
    current_setting('request.jwt.claims', true)::jsonb ->> 'state'
  ),
  'cached or client-projected ACTIVE state cannot override authoritative expiry'
);

select * from finish();
rollback;
