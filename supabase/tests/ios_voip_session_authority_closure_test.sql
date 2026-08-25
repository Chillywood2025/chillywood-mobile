begin;

create extension if not exists pgtap with schema extensions;
select plan(35);

select has_column('public', 'user_voip_push_tokens', 'account_id', 'VoIP tokens carry exact account identity');
select has_column('public', 'user_voip_push_tokens', 'session_generation', 'VoIP tokens carry exact auth session generation');
select has_column('public', 'user_voip_push_tokens', 'ownership_state', 'VoIP tokens carry canonical ownership state');
select has_column('public', 'user_voip_push_tokens', 'revocation_credential_hash', 'VoIP tokens bind a device revocation credential');
select has_function('public', 'whole_app_register_ios_voip_push_token', array['uuid','uuid','uuid','text','text','text','text','text','text','text'], 'exact registration RPC exists');
select has_function('public', 'whole_app_revoke_ios_voip_push_ownership', array['uuid','uuid','uuid','text','text','text','text','text'], 'exact destructive-only revocation RPC exists');
select has_function('public', 'whole_app_read_deliverable_ios_voip_tokens', array['uuid'], 'service deliverability readback exists');
select ok(has_function_privilege('authenticated', 'public.whole_app_register_ios_voip_push_token(uuid,uuid,uuid,text,text,text,text,text,text,text)', 'EXECUTE'), 'authenticated sessions may request exact registration');
select ok(not has_function_privilege('authenticated', 'public.whole_app_revoke_ios_voip_push_ownership(uuid,uuid,uuid,text,text,text,text,text)', 'EXECUTE'), 'JWT-independent revocation stays service-only');
select ok(not has_function_privilege('authenticated', 'public.whole_app_read_deliverable_ios_voip_tokens(uuid)', 'EXECUTE'), 'authenticated clients cannot read raw deliverable tokens');

insert into auth.users (id, is_sso_user, is_anonymous)
values
  ('a1111111-1111-4111-8111-111111111111', false, false),
  ('b2222222-2222-4222-8222-222222222222', false, false);

insert into auth.sessions (id, user_id)
values
  ('a1111111-1111-4111-8111-111111111101', 'a1111111-1111-4111-8111-111111111111'),
  ('a1111111-1111-4111-8111-111111111102', 'a1111111-1111-4111-8111-111111111111'),
  ('b2222222-2222-4222-8222-222222222201', 'b2222222-2222-4222-8222-222222222222'),
  ('b2222222-2222-4222-8222-222222222202', 'b2222222-2222-4222-8222-222222222222');

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1111111-1111-4111-8111-111111111111","session_id":"a1111111-1111-4111-8111-111111111101"}',
  true
);

select is(
  public.whole_app_register_ios_voip_push_token(
    'a1111111-1111-4111-8111-111111111111',
    'a1111111-1111-4111-8111-111111111111',
    'a1111111-1111-4111-8111-111111111101',
    'ios-voip-install-1',
    'development',
    repeat('1', 64),
    repeat('a', 64),
    'register:a-session-1',
    '1.0.0',
    '100'
  )->>'status',
  'registered',
  'initial registration binds the exact current account/session/install'
);

select ok(
  (select enabled
      and ownership_state = 'ACCOUNT_BOUND'
      and account_id = user_id
      and session_generation = 'a1111111-1111-4111-8111-111111111101'
    from public.user_voip_push_tokens
    where install_id = 'ios-voip-install-1'),
  'registered row contains complete deliverable authority'
);

select ok(
  (public.whole_app_ios_voip_push_readback(
    'a1111111-1111-4111-8111-111111111111',
    'a1111111-1111-4111-8111-111111111111',
    'a1111111-1111-4111-8111-111111111101',
    'ios-voip-install-1',
    'development'
  )->>'registered')::boolean,
  'status readback requires and returns the exact current session binding'
);

select is(
  (select count(*)::integer from public.whole_app_read_deliverable_ios_voip_tokens('a1111111-1111-4111-8111-111111111111')),
  1,
  'service dispatch sees one exact live-session token'
);

select throws_ok(
  $$select public.whole_app_register_ios_voip_push_token(
    'a1111111-1111-4111-8111-111111111111',
    'b2222222-2222-4222-8222-222222222222',
    'a1111111-1111-4111-8111-111111111101',
    'ios-voip-install-1', 'development', repeat('1',64), repeat('a',64), 'wrong:account', null, null
  )$$,
  'P0001',
  'ios_voip_registration_invalid',
  'caller-controlled account substitution fails closed'
);

select throws_ok(
  $$select public.whole_app_register_ios_voip_push_token(
    'a1111111-1111-4111-8111-111111111111',
    'a1111111-1111-4111-8111-111111111111',
    'a1111111-1111-4111-8111-111111111102',
    'ios-voip-install-1', 'development', repeat('1',64), repeat('a',64), 'wrong:session', null, null
  )$$,
  'P0001',
  'ios_voip_session_binding_mismatch',
  'another live session generation cannot be substituted'
);

select throws_ok(
  $$select public.whole_app_register_ios_voip_push_token(
    'b2222222-2222-4222-8222-222222222222',
    'b2222222-2222-4222-8222-222222222222',
    'b2222222-2222-4222-8222-222222222201',
    'ios-voip-install-1', 'development', repeat('1',64), repeat('a',64), 'wrong:user', null, null
  )$$,
  'P0001',
  'ios_voip_session_binding_mismatch',
  'another user cannot be substituted under the current JWT'
);

select throws_ok(
  $$select public.whole_app_register_ios_voip_push_token(
    'a1111111-1111-4111-8111-111111111111',
    'a1111111-1111-4111-8111-111111111111',
    'a1111111-1111-4111-8111-111111111101',
    'ios-voip-install-1', 'development', repeat('2',64), repeat('b',64), 'wrong:credential', null, null
  )$$,
  'P0001',
  'ios_voip_registration_credential_mismatch',
  'an active install cannot be taken over without its device credential'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"b2222222-2222-4222-8222-222222222222","session_id":"b2222222-2222-4222-8222-222222222201"}',
  true
);

select is(
  public.whole_app_register_ios_voip_push_token(
    'b2222222-2222-4222-8222-222222222222',
    'b2222222-2222-4222-8222-222222222222',
    'b2222222-2222-4222-8222-222222222201',
    'ios-voip-install-1',
    'development',
    repeat('1', 64),
    repeat('a', 64),
    'register:b-account-switch',
    null,
    null
  )->>'userId',
  'b2222222-2222-4222-8222-222222222222',
  'the same physical install credential permits an exact authenticated account switch'
);

select is(
  public.whole_app_revoke_ios_voip_push_ownership(
    'a1111111-1111-4111-8111-111111111111',
    'a1111111-1111-4111-8111-111111111111',
    'a1111111-1111-4111-8111-111111111101',
    'ios-voip-install-1',
    'all',
    repeat('a', 64),
    'revoke:old-a',
    'account_switch'
  )->>'disposition',
  'already_detached',
  'a stale old-session revoke cannot revoke the replacement account binding'
);

select ok(
  (select enabled and user_id = 'b2222222-2222-4222-8222-222222222222'
   from public.user_voip_push_tokens where install_id = 'ios-voip-install-1'),
  'replacement account delivery remains active after stale old-session revoke'
);

select is(
  public.whole_app_revoke_ios_voip_push_ownership(
    'b2222222-2222-4222-8222-222222222222',
    'b2222222-2222-4222-8222-222222222222',
    'b2222222-2222-4222-8222-222222222201',
    'ios-voip-install-1', 'all', repeat('b',64), 'revoke:wrong-credential', 'sign_out'
  )->>'status',
  'retry_required',
  'wrong revocation credential fails closed'
);

select ok(
  (select enabled from public.user_voip_push_tokens where install_id = 'ios-voip-install-1'),
  'wrong revocation credential does not change delivery authority'
);

select is(
  public.whole_app_revoke_ios_voip_push_ownership(
    'b2222222-2222-4222-8222-222222222222',
    'b2222222-2222-4222-8222-222222222222',
    'b2222222-2222-4222-8222-222222222201',
    'ios-voip-install-1', 'all', repeat('a',64), 'revoke:correct', 'sign_out'
  )->>'disposition',
  'revoked',
  'exact credential revokes the exact account/session/install'
);

select is(
  public.whole_app_revoke_ios_voip_push_ownership(
    'b2222222-2222-4222-8222-222222222222',
    'b2222222-2222-4222-8222-222222222222',
    'b2222222-2222-4222-8222-222222222201',
    'ios-voip-install-1', 'all', repeat('a',64), 'revoke:duplicate', 'sign_out'
  )->>'disposition',
  'already_revoked',
  'duplicate exact revocation is idempotent'
);

select public.whole_app_register_ios_voip_push_token(
  'b2222222-2222-4222-8222-222222222222',
  'b2222222-2222-4222-8222-222222222222',
  'b2222222-2222-4222-8222-222222222201',
  'ios-voip-install-1', 'development', repeat('3',64), repeat('a',64), 'register:before-session-delete', null, null
);
delete from auth.sessions where id = 'b2222222-2222-4222-8222-222222222201';

select ok(
  not exists (
    select 1 from public.user_voip_push_tokens
    where install_id = 'ios-voip-install-1'
      and (enabled or ownership_state <> 'REVOKED' or session_generation is not null)
  ),
  'auth session deletion durably revokes and detaches the exact PushKit row'
);

select is(
  (select count(*)::integer from public.whole_app_read_deliverable_ios_voip_tokens('b2222222-2222-4222-8222-222222222222')),
  0,
  'deleted session generation is never deliverable'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"b2222222-2222-4222-8222-222222222222","session_id":"b2222222-2222-4222-8222-222222222202"}',
  true
);
select public.whole_app_register_ios_voip_push_token(
  'b2222222-2222-4222-8222-222222222222',
  'b2222222-2222-4222-8222-222222222222',
  'b2222222-2222-4222-8222-222222222202',
  'ios-voip-install-2', 'production', repeat('4',64), repeat('c',64), 'register:before-ban', null, null
);
update auth.users
set banned_until = timezone('utc'::text, now()) + interval '1 hour'
where id = 'b2222222-2222-4222-8222-222222222222';

select ok(
  (select not enabled and ownership_state = 'REVOKED' and last_revocation_reason = 'account_restricted'
   from public.user_voip_push_tokens where install_id = 'ios-voip-install-2'),
  'account restriction durably revokes every active PushKit binding'
);

update auth.users
set banned_until = null
where id = 'b2222222-2222-4222-8222-222222222222';
select ok(
  (select not enabled from public.user_voip_push_tokens where install_id = 'ios-voip-install-2'),
  'lifting a restriction never resurrects stale PushKit authority'
);

select public.whole_app_register_ios_voip_push_token(
  'b2222222-2222-4222-8222-222222222222',
  'b2222222-2222-4222-8222-222222222222',
  'b2222222-2222-4222-8222-222222222202',
  'ios-voip-install-2', 'production', repeat('5',64), repeat('c',64), 'register:before-delete', null, null
);
insert into public.account_deletion_requests (user_id, status, delete_after, restore_deadline)
values (
  'b2222222-2222-4222-8222-222222222222',
  'scheduled',
  timezone('utc'::text, now()) + interval '30 days',
  timezone('utc'::text, now()) + interval '30 days'
);

select ok(
  not exists (
    select 1 from public.user_voip_push_tokens
    where install_id = 'ios-voip-install-2'
      and (enabled or ownership_state <> 'REVOKED' or last_revocation_reason <> 'account_deletion')
  ),
  'scheduled deletion revokes PushKit authority even for a restore-only session'
);

select throws_ok(
  $$select public.whole_app_register_ios_voip_push_token(
    'b2222222-2222-4222-8222-222222222222',
    'b2222222-2222-4222-8222-222222222222',
    'b2222222-2222-4222-8222-222222222202',
    'restore-only-install', 'production', repeat('6',64), repeat('c',64), 'register:restore-only', null, null
  )$$,
  'P0001',
  'ios_voip_session_binding_mismatch',
  'restore-only sessions cannot recreate PushKit delivery authority'
);

update public.account_deletion_requests
set status = 'restored', restored_at = timezone('utc'::text, now())
where user_id = 'b2222222-2222-4222-8222-222222222222' and status = 'scheduled';
select ok(
  not exists (
    select 1 from public.user_voip_push_tokens
    where install_id = 'ios-voip-install-2' and enabled
  ),
  'account restoration never resurrects a pre-deletion PushKit binding'
);

select throws_ok(
  $$insert into public.user_voip_push_tokens (
    user_id, install_id, token, token_hash, token_fingerprint, apns_environment
  ) values (
    'a1111111-1111-4111-8111-111111111111',
    'legacy-unsafe-install',
    repeat('9',64),
    repeat('9',64),
    repeat('9',12),
    'development'
  )$$,
  '23514',
  null,
  'legacy write shape cannot create active delivery without exact session authority'
);

select is(
  (select count(*)::integer
   from public.user_voip_push_tokens
   where enabled and (
     ownership_state <> 'ACCOUNT_BOUND'
     or account_id is distinct from user_id
     or session_generation is null
     or revocation_credential_hash is null
   )),
  0,
  'no active row can exist without complete exact ownership authority'
);

select is(
  (select count(*)::integer
   from pg_trigger
   where not tgisinternal
     and tgname in (
       'whole_app_revoke_ios_voip_on_session_delete',
       'whole_app_revoke_ios_voip_on_account_deletion',
       'whole_app_revoke_ios_voip_on_auth_restriction'
     )),
  3,
  'session deletion, account deletion, and restriction all have durable revocation triggers'
);

select * from finish();
rollback;
