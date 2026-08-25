begin;
select plan(16);

insert into auth.users (id, is_sso_user, is_anonymous)
values
  ('51111111-1111-4111-8111-111111111111', false, false),
  ('52222222-2222-4222-8222-222222222222', false, false),
  ('53333333-3333-4333-8333-333333333333', false, false)
on conflict (id) do nothing;

select set_config(
  'request.jwt.claim.sub',
  '51111111-1111-4111-8111-111111111111',
  true
);

select is(
  (
    select concat_ws(
      ':',
      public_default_provider,
      canary_provider,
      case when canary_enabled then 'true' else 'false' end,
      case when livekit_emergency_stop then 'true' else 'false' end
    )
    from public.chat_call_media_rollout_control
    where singleton
  ),
  'legacy_webrtc:livekit:false:true',
  'rollout begins fail-closed with public legacy, canary disabled, and emergency stop on'
);

select is(
  public.resolve_chilly_chat_call_media_provider(
    '51111111-1111-4111-8111-111111111111',
    '52222222-2222-4222-8222-222222222222'
  ),
  'legacy_webrtc',
  'unenrolled calls resolve to legacy WebRTC'
);

select ok(
  not has_table_privilege('authenticated', 'public.chat_call_media_rollout_control', 'select')
  and not has_table_privilege('anon', 'public.chat_call_media_rollout_control', 'select'),
  'rollout state is not readable by app clients'
);

select ok(
  not has_table_privilege('authenticated', 'public.chat_call_livekit_canary_users', 'select')
  and not has_table_privilege('anon', 'public.chat_call_livekit_canary_users', 'select'),
  'canary identities are not readable by app clients'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.resolve_chilly_chat_call_media_provider(uuid,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.resolve_chilly_chat_call_media_provider(uuid,uuid)',
    'execute'
  ),
  'provider resolution is server-only'
);

update public.chat_call_media_rollout_control
set canary_enabled = true, livekit_emergency_stop = false
where singleton;

insert into public.chat_call_livekit_canary_users (user_id, enabled, enrolled_by)
values (
  '51111111-1111-4111-8111-111111111111',
  true,
  '51111111-1111-4111-8111-111111111111'
);

select is(
  public.resolve_chilly_chat_call_media_provider(
    '51111111-1111-4111-8111-111111111111',
    '52222222-2222-4222-8222-222222222222'
  ),
  'legacy_webrtc',
  'one enrolled participant cannot select LiveKit'
);

insert into public.chat_call_livekit_canary_users (user_id, enabled, enrolled_by)
values (
  '52222222-2222-4222-8222-222222222222',
  true,
  '51111111-1111-4111-8111-111111111111'
);

select is(
  public.resolve_chilly_chat_call_media_provider(
    '51111111-1111-4111-8111-111111111111',
    '52222222-2222-4222-8222-222222222222'
  ),
  'livekit',
  'two enabled canary participants select LiveKit for a new call'
);

select is(
  public.resolve_chilly_chat_call_media_provider(
    '51111111-1111-4111-8111-111111111111',
    '53333333-3333-4333-8333-333333333333'
  ),
  'legacy_webrtc',
  'a third non-canary participant cannot join the LiveKit cohort'
);

update public.chat_call_livekit_canary_users
set enabled = false
where user_id = '52222222-2222-4222-8222-222222222222';

select is(
  public.resolve_chilly_chat_call_media_provider(
    '51111111-1111-4111-8111-111111111111',
    '52222222-2222-4222-8222-222222222222'
  ),
  'legacy_webrtc',
  'a disabled cohort member resolves new calls to legacy WebRTC'
);

update public.chat_call_livekit_canary_users
set enabled = true
where user_id = '52222222-2222-4222-8222-222222222222';

insert into public.chat_threads (id, thread_kind, participant_pair_key, created_by)
values (
  '5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'direct',
  '51111111-1111-4111-8111-111111111111::52222222-2222-4222-8222-222222222222',
  '51111111-1111-4111-8111-111111111111'
);

insert into public.chat_thread_members (thread_id, user_id)
values
  ('5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '51111111-1111-4111-8111-111111111111'),
  ('5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '52222222-2222-4222-8222-222222222222');

insert into public.communication_rooms (room_id, room_code, host_user_id, status)
values (
  'LKCALL1',
  'LKCALL1',
  '51111111-1111-4111-8111-111111111111',
  'active'
);

insert into public.chat_call_invites (
  id,
  thread_id,
  communication_room_id,
  caller_user_id,
  callee_user_id,
  call_type,
  status,
  expires_at,
  chat_call_media_provider
) values (
  '50000000-0000-4000-8000-000000000001',
  '5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'LKCALL1',
  '51111111-1111-4111-8111-111111111111',
  '52222222-2222-4222-8222-222222222222',
  'video',
  'ringing',
  now() + interval '5 minutes',
  'legacy_webrtc'
);

select is(
  (
    select chat_call_media_provider
    from public.chat_call_invites
    where id = '50000000-0000-4000-8000-000000000001'
  ),
  'livekit',
  'the server trigger overrides a client-supplied provider'
);

select throws_ok(
  $$update public.chat_call_invites
    set chat_call_media_provider = 'legacy_webrtc'
    where id = '50000000-0000-4000-8000-000000000001'$$,
  'chat_call_invite_binding_immutable',
  'an attempted transport rewrite is rejected as an immutable invite binding'
);

select is(
  (
    select chat_call_media_provider
    from public.chat_call_invites
    where id = '50000000-0000-4000-8000-000000000001'
  ),
  'livekit',
  'the selected provider is immutable for the lifetime of an invite'
);

update public.chat_call_media_rollout_control
set livekit_emergency_stop = true, canary_enabled = false
where singleton;

select is(
  public.resolve_chilly_chat_call_media_provider(
    '51111111-1111-4111-8111-111111111111',
    '52222222-2222-4222-8222-222222222222'
  ),
  'legacy_webrtc',
  'emergency stop forces new calls to legacy WebRTC'
);

select is(
  (
    select chat_call_media_provider
    from public.chat_call_invites
    where id = '50000000-0000-4000-8000-000000000001'
  ),
  'livekit',
  'emergency stop does not switch an active call transport mid-call'
);

select throws_ok(
  $$update public.chat_call_media_rollout_control
    set public_default_provider = 'livekit'
    where singleton$$,
  '23514',
  null,
  'public default cannot be changed to LiveKit by rollout state'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.configure_chilly_chat_livekit_canary(boolean,boolean)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.set_chilly_chat_livekit_canary_user(uuid,boolean)',
    'execute'
  ),
  'anonymous callers cannot mutate canary control or enrollment'
);

select * from finish();
rollback;
