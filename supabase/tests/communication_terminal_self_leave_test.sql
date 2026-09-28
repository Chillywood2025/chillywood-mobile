begin;
select plan(30);

select has_column('public', 'communication_room_memberships', 'membership_generation', 'membership cleanup has a server generation');
select col_not_null('public', 'communication_room_memberships', 'membership_generation', 'existing and new rows receive a generation');
select has_function('public', 'leave_communication_room_session', array['text', 'uuid'], 'bounded self-leave RPC exists');
select ok(has_function_privilege('authenticated', 'public.leave_communication_room_session(text,uuid)', 'EXECUTE'), 'authenticated self cleanup is callable');
select ok(not has_function_privilege('anon', 'public.leave_communication_room_session(text,uuid)', 'EXECUTE'), 'anonymous execution is closed');
select ok(not has_function_privilege('service_role', 'public.leave_communication_room_session(text,uuid)', 'EXECUTE'), 'service role is not an arbitrary-subject cleanup route');
select ok(not has_column_privilege('authenticated', 'public.communication_room_memberships', 'membership_generation', 'UPDATE'), 'client cannot rewrite generation');
select has_trigger('public', 'communication_room_memberships', 'zz_advance_communication_membership_generation', 'rotation runs after membership/ended-room guards');
select ok((select relrowsecurity from pg_class where oid='public.communication_room_memberships'::regclass), 'membership RLS remains enabled');

insert into auth.users (id, is_sso_user, is_anonymous) values
  ('d9111111-1111-4111-8111-111111111111', false, false),
  ('d9222222-2222-4222-8222-222222222222', false, false);
insert into auth.sessions (id, user_id) values
  ('d9111111-1111-4111-8111-111111111110', 'd9111111-1111-4111-8111-111111111111'),
  ('d9222222-2222-4222-8222-222222222220', 'd9222222-2222-4222-8222-222222222222');
insert into public.user_profiles (user_id, username, display_name) values
  ('d9111111-1111-4111-8111-111111111111', 'terminal_leave_a', 'Terminal A'),
  ('d9222222-2222-4222-8222-222222222222', 'terminal_leave_b', 'Terminal B')
on conflict (user_id) do update set display_name=excluded.display_name;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"d9111111-1111-4111-8111-111111111111","session_id":"d9111111-1111-4111-8111-111111111110"}', true);
insert into public.communication_rooms (room_id, room_code, host_user_id, status, content_access_rule)
values ('LEAVEGEN1', 'LEAVEGEN1', 'd9111111-1111-4111-8111-111111111111', 'active', 'open');
select set_config('test.cleanup_generation', (select membership_generation::text from public.join_communication_room_session('LEAVEGEN1', null, null, true, true)), true);
select ok(length(current_setting('test.cleanup_generation'))=36, 'old join signature returns a server-generated token');
select is((select membership_generation::text from public.join_communication_room_session('LEAVEGEN1', null, null, true, true)), current_setting('test.cleanup_generation'), 'duplicate active join retains generation');
select results_eq(
  $$update public.communication_room_memberships set mic_enabled=false,camera_enabled=false where room_id='LEAVEGEN1' and user_id='d9111111-1111-4111-8111-111111111111' returning membership_state$$,
  $$values ('active'::text)$$,
  'old v3 media-update request still succeeds'
);
select is((select membership_generation::text from public.communication_room_memberships where room_id='LEAVEGEN1'), current_setting('test.cleanup_generation'), 'media preference update never rotates generation');
select lives_ok(
  $$select room_id,user_id,role,membership_state,camera_enabled,mic_enabled,display_name,avatar_url,joined_at,last_seen_at,left_at,updated_at from public.communication_room_memberships where room_id='LEAVEGEN1'$$,
  'old v3 explicit column list remains valid'
);
select throws_ok(
  $$update public.communication_room_memberships set membership_generation=gen_random_uuid() where room_id='LEAVEGEN1'$$,
  '42501', null, 'authenticated generation rewrite is denied'
);
select results_eq(
  $$update public.communication_room_memberships set membership_state='left',camera_enabled=false,mic_enabled=false where room_id='LEAVEGEN1' and user_id='d9111111-1111-4111-8111-111111111111' returning membership_state$$,
  $$values ('left'::text)$$,
  'old v3 ordinary leave works before terminal visibility closes'
);
select set_config('test.replacement_generation', (select membership_generation::text from public.join_communication_room_session('LEAVEGEN1', null, null, true, true)), true);
select isnt(current_setting('test.replacement_generation'), current_setting('test.cleanup_generation'), 'a real left-to-active admission rotates generation');
select throws_ok(
  $$select public.leave_communication_room_session('LEAVEGEN1', current_setting('test.cleanup_generation')::uuid)$$,
  'communication_membership_cleanup_generation_changed', 'late old cleanup cannot retire replacement'
);
select is((select membership_state from public.communication_room_memberships where room_id='LEAVEGEN1'), 'active', 'replacement remains active after rejected old leave');
select lives_ok(
  $$select public.leave_communication_room_session('LEAVEGEN1', current_setting('test.replacement_generation')::uuid)$$,
  'exact current-generation cleanup succeeds'
);
select results_eq(
  $$select membership_state,camera_enabled,mic_enabled from public.leave_communication_room_session('LEAVEGEN1', current_setting('test.replacement_generation')::uuid)$$,
  $$values ('left'::text,false,false)$$,
  'lost-response retry verifies terminal media-off postconditions'
);

select set_config('request.jwt.claims', '{"role":"authenticated","sub":"d9222222-2222-4222-8222-222222222222","session_id":"d9222222-2222-4222-8222-222222222220"}', true);
select throws_ok(
  $$select public.leave_communication_room_session('LEAVEGEN1', current_setting('test.replacement_generation')::uuid)$$,
  'communication_membership_cleanup_not_found', 'other user cannot discover or clean the host row'
);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"d9111111-1111-4111-8111-111111111111","session_id":"d9111111-1111-4111-8111-111111111110"}', true);
select throws_ok($$select public.leave_communication_room_session('LEAVEGEN1',null)$$,
  'communication_membership_cleanup_identity_required', 'missing generation never counts as cleanup');
select throws_ok($$select public.leave_communication_room_session('MISSING1',current_setting('test.replacement_generation')::uuid)$$,
  'communication_membership_cleanup_not_found', 'absent row never counts as cleanup');
reset role;
delete from auth.sessions where id='d9111111-1111-4111-8111-111111111110';
set local role authenticated;
select throws_ok($$select public.leave_communication_room_session('LEAVEGEN1',current_setting('test.replacement_generation')::uuid)$$,
  'communication_room_current_session_required', 'revoked exact session is denied despite a retained JWT claim');
reset role;
insert into auth.sessions (id,user_id) values ('d9111111-1111-4111-8111-111111111110','d9111111-1111-4111-8111-111111111111');
update public.communication_rooms set status='ended' where room_id='LEAVEGEN1';
set local role authenticated;
select is((select count(*)::integer from public.communication_room_memberships where room_id='LEAVEGEN1'), 0, 'ordinary terminal room discovery stays closed');
select results_eq(
  $$select user_id,membership_state,camera_enabled,mic_enabled from public.leave_communication_room_session('LEAVEGEN1',current_setting('test.replacement_generation')::uuid)$$,
  $$values ('d9111111-1111-4111-8111-111111111111'::text,'left'::text,false,false)$$,
  'exact terminal self receipt remains available without peer discovery'
);
reset role;
update public.communication_room_memberships set membership_state='active',camera_enabled=true,mic_enabled=true where room_id='LEAVEGEN1';
select is((select membership_generation::text from public.communication_room_memberships where room_id='LEAVEGEN1'), current_setting('test.replacement_generation'), 'suppressed ended-room reactivation does not rotate generation');
update public.communication_room_memberships set membership_state='removed',camera_enabled=false,mic_enabled=false,left_at=now() where room_id='LEAVEGEN1';
set local role authenticated;
select is((select membership_state from public.leave_communication_room_session('LEAVEGEN1',current_setting('test.replacement_generation')::uuid)), 'removed', 'removed membership remains removed and cannot resurrect');
reset role;
set local role anon;
select throws_ok($$select public.leave_communication_room_session('LEAVEGEN1',current_setting('test.replacement_generation')::uuid)$$,
  '42501', null, 'anonymous invocation is rejected at the RPC grant boundary');
reset role;

select * from finish();
rollback;
