begin;
select plan(85);

select has_column('public', 'communication_room_memberships', 'membership_generation', 'membership cleanup has a server generation');
select col_not_null('public', 'communication_room_memberships', 'membership_generation', 'existing and new rows receive a generation');
select has_function('public', 'leave_communication_room_session', array['text', 'uuid'], 'bounded self-leave RPC exists');
select ok(has_function_privilege('authenticated', 'public.leave_communication_room_session(text,uuid)', 'EXECUTE'), 'authenticated self cleanup is callable');
select ok(not has_function_privilege('anon', 'public.leave_communication_room_session(text,uuid)', 'EXECUTE'), 'anonymous execution is closed');
select ok(not has_function_privilege('service_role', 'public.leave_communication_room_session(text,uuid)', 'EXECUTE'), 'service role is not an arbitrary-subject cleanup route');
select ok(not has_column_privilege('authenticated', 'public.communication_room_memberships', 'membership_generation', 'UPDATE'), 'client cannot rewrite generation');
select has_trigger('public', 'communication_room_memberships', 'zz_advance_communication_membership_generation', 'rotation runs after membership/ended-room guards');
select ok((select relrowsecurity from pg_class where oid='public.communication_room_memberships'::regclass), 'membership RLS remains enabled');
select has_column('public', 'communication_room_memberships', 'membership_admission_attempt', 'modern owners have a durable admission identity');
select ok(not has_column_privilege('authenticated', 'public.communication_room_memberships', 'membership_admission_attempt', 'UPDATE'), 'client cannot assign its own durable owner');
select ok((select count(*)=3 and bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('read_communication_room_admission','join_owned_communication_room_session','touch_owned_communication_room_session')),
  'admission and owned session RPCs are available to authenticated clients');
select ok((select count(*)=3 and bool_and(not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('service_role',p.oid,'EXECUTE'))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('read_communication_room_admission','join_owned_communication_room_session','touch_owned_communication_room_session')),
  'owned RPC grants expose neither anonymous nor arbitrary-subject service authority');
select ok(not has_function_privilege('authenticated','public.guard_owned_communication_membership_write()','EXECUTE')
  and not has_function_privilege('anon','public.guard_owned_communication_membership_write()','EXECUTE')
  and not has_function_privilege('service_role','public.guard_owned_communication_membership_write()','EXECUTE'),
  'the modern-row write guard is internal-only');
select ok(has_function_privilege('authenticated','public.broadcast_owned_communication_room_signal(text,uuid,text,jsonb)','EXECUTE')
  and not has_function_privilege('anon','public.broadcast_owned_communication_room_signal(text,uuid,text,jsonb)','EXECUTE')
  and not has_function_privilege('service_role','public.broadcast_owned_communication_room_signal(text,uuid,text,jsonb)','EXECUTE'),
  'owned relay is callable only through authenticated session authority');
select ok(not has_function_privilege('authenticated','public.broadcast_communication_room_signal_internal(text,text,jsonb,uuid)','EXECUTE')
  and not has_function_privilege('anon','public.broadcast_communication_room_signal_internal(text,text,jsonb,uuid)','EXECUTE')
  and not has_function_privilege('service_role','public.broadcast_communication_room_signal_internal(text,text,jsonb,uuid)','EXECUTE'),
  'internal relay helper has no public execution grants');

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

-- This separate row is owned by the modern per-admission API. Legacy behavior
-- above must stay functional without permitting old clients to steal this row.
select ok(not has_function_privilege('authenticated','public.authorize_communication_room_admission_internal(text)','EXECUTE')
  and not has_function_privilege('anon','public.authorize_communication_room_admission_internal(text)','EXECUTE')
  and not has_function_privilege('service_role','public.authorize_communication_room_admission_internal(text)','EXECUTE'),
  'private admission authorization helper is never a callable public API');
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"d9111111-1111-4111-8111-111111111111","session_id":"d9111111-1111-4111-8111-111111111110"}', true);
insert into public.communication_rooms (room_id,room_code,host_user_id,status,content_access_rule)
values ('OWNGEN1','OWNGEN1','d9111111-1111-4111-8111-111111111111','active','open');
select is(public.read_communication_room_admission('OWNGEN1')->>'previousGeneration', null::text, 'initial admission read expects an absent self row');
select is(public.read_communication_room_admission('OWNGEN1')->>'userId', 'd9111111-1111-4111-8111-111111111111', 'admission read derives its actor from the exact session');
select set_config('test.owner_generation_one', (select membership_generation::text
  from public.join_owned_communication_room_session('OWNGEN1','d9333333-3333-4333-8333-333333333331',null,null,null,true,true)),true);
select is((select membership_admission_attempt::text from public.communication_room_memberships where room_id='OWNGEN1'),
  'd9333333-3333-4333-8333-333333333331','server persists the admitted attempt identity');
select set_config('test.owner_joined_at', (select joined_at::text from public.communication_room_memberships where room_id='OWNGEN1'),true);
select results_eq(
  $$select camera_enabled,mic_enabled from public.touch_owned_communication_room_session('OWNGEN1',current_setting('test.owner_generation_one')::uuid,null,false,false)$$,
  $$values (false,false)$$,'current owner can mute its own media');
select results_eq(
  $$select membership_generation::text,camera_enabled,mic_enabled from public.join_owned_communication_room_session('OWNGEN1','d9333333-3333-4333-8333-333333333331',null,null,null,true,true)$$,
  $$select current_setting('test.owner_generation_one'),false,false$$,
  'retrying the same admission is idempotent and preserves newer muted state');
select is(public.read_communication_room_admission('OWNGEN1')->>'previousGeneration',current_setting('test.owner_generation_one'),
  'independent process observes the current active generation');
select set_config('test.owner_generation_two',(select membership_generation::text
  from public.join_owned_communication_room_session('OWNGEN1','d9333333-3333-4333-8333-333333333332',current_setting('test.owner_generation_one')::uuid,null,null,true,true)),true);
select isnt(current_setting('test.owner_generation_one'),current_setting('test.owner_generation_two'),'replacement ACTIVE owner rotates generation');
select is(public.broadcast_owned_communication_room_signal('OWNGEN1',current_setting('test.owner_generation_two')::uuid,'media:update',
  '{"cameraOn":true,"micOn":true,"fromUserId":"d9222222-2222-4222-8222-222222222222","membershipGeneration":"d9333333-3333-4333-8333-333333333335"}'::jsonb)->>'membershipGeneration',
  current_setting('test.owner_generation_two'),'owned relay receipt uses server generation despite spoofed payload metadata');
select throws_ok($$select public.broadcast_owned_communication_room_signal('OWNGEN1',current_setting('test.owner_generation_one')::uuid,'media:update','{"cameraOn":false,"micOn":false}')$$,
  'communication_membership_generation_changed','retired owner cannot broadcast media or negotiation state');
select throws_ok($$select public.broadcast_communication_room_signal('OWNGEN1','media:update','{"cameraOn":false,"micOn":false}')$$,
  'communication_membership_owned_signal_required','legacy relay cannot bypass modern sender fencing');
select is(public.broadcast_communication_room_signal('OWNGEN1','room:end','{"reason":"host-left"}')->>'event','room:end',
  'host room:end contract remains available separately from member media signaling');
select throws_ok($$select public.broadcast_communication_room_signal_internal('OWNGEN1','media:update','{"cameraOn":false,"micOn":false}',current_setting('test.owner_generation_two')::uuid)$$,
  '42501',null,'authenticated caller cannot invoke internal relay helper directly');
select is((select joined_at::text from public.communication_room_memberships where room_id='OWNGEN1'),current_setting('test.owner_joined_at'),'ownership rotation preserves historical joined_at');
select throws_ok($$select public.leave_communication_room_session('OWNGEN1',current_setting('test.owner_generation_one')::uuid)$$,
  'communication_membership_cleanup_generation_changed','old owner cannot leave replacement');
select throws_ok($$select public.touch_owned_communication_room_session('OWNGEN1',current_setting('test.owner_generation_one')::uuid,null,false,false)$$,
  'communication_membership_generation_changed','old owner cannot overwrite replacement media');
select throws_ok($$select public.touch_owned_communication_room_session('OWNGEN1',current_setting('test.owner_generation_one')::uuid)$$,
  'communication_membership_generation_changed','old owner cannot keep replacement alive through heartbeat');
select throws_ok($$select public.join_owned_communication_room_session('OWNGEN1','d9333333-3333-4333-8333-333333333331',null)$$,
  'communication_membership_admission_conflict','delayed original admission cannot steal its replacement');
select throws_ok($$select public.join_communication_room_session('OWNGEN1',null,null,false,false)$$,
  'communication_membership_owned_admission_required','old five-argument RPC cannot take a modern-owned row');
select throws_ok($$update public.communication_room_memberships set camera_enabled=false,mic_enabled=false where room_id='OWNGEN1'$$,
  'communication_membership_owned_write_required','old direct media write cannot mutate a modern-owned row');
select results_eq($$select membership_generation::text,camera_enabled,mic_enabled from public.communication_room_memberships where room_id='OWNGEN1'$$,
  $$select current_setting('test.owner_generation_two'),true,true$$,'denied old operations leave the replacement media unchanged');
select set_config('test.owner_generation_three',(select membership_generation::text
  from public.join_owned_communication_room_session('OWNGEN1','d9333333-3333-4333-8333-333333333333',current_setting('test.owner_generation_two')::uuid,null,null,true,true)),true);
select throws_ok($$select public.join_owned_communication_room_session('OWNGEN1','d9333333-3333-4333-8333-333333333334',current_setting('test.owner_generation_two')::uuid)$$,
  'communication_membership_admission_conflict','a competing stale compare-and-swap loses after the first admission commits');
select is((select membership_generation::text from public.communication_room_memberships where room_id='OWNGEN1'),current_setting('test.owner_generation_three'),
  'losing admission cannot rotate the winning owner');
select throws_ok($$update public.communication_room_memberships set membership_admission_attempt='d9333333-3333-4333-8333-333333333335' where room_id='OWNGEN1'$$,
  '42501',null,'client cannot rewrite attempt identity');
select throws_ok($$select public.authorize_communication_room_admission_internal('OWNGEN1')$$,
  '42501',null,'authenticated caller cannot invoke private admission helper');
select lives_ok($$select public.leave_communication_room_session('OWNGEN1',current_setting('test.owner_generation_three')::uuid)$$,'current owned generation leaves successfully');
select throws_ok($$select public.join_owned_communication_room_session('OWNGEN1','d9333333-3333-4333-8333-333333333333',current_setting('test.owner_generation_two')::uuid)$$,
  'communication_membership_admission_retired','completed admission cannot resurrect itself by retry');
select throws_ok($$select public.touch_owned_communication_room_session('OWNGEN1',current_setting('test.owner_generation_three')::uuid)$$,
  'communication_membership_not_active','heartbeat cannot reactivate a left membership');
select throws_ok($$select public.join_communication_room_session('OWNGEN1',null,null,true,true)$$,
  'communication_membership_owned_admission_required','old installed client cannot reactivate a retired modern owner');

-- Own membership heartbeat/media is valid for participants as well as hosts.
-- The room timestamp write stays host-only under the original identity trigger
-- and RLS; neither guard is widened to make a participant media write succeed.
insert into public.communication_rooms (room_id,room_code,host_user_id,status,content_access_rule)
values ('OWNPART1','OWNPART1','d9111111-1111-4111-8111-111111111111','active','open');
select set_config('test.part_host_generation',(select membership_generation::text
  from public.join_owned_communication_room_session('OWNPART1','d9333333-3333-4333-8333-333333333341',null,null,null,true,true)),true);
reset role;
update public.communication_rooms set last_activity_at=now()-interval '1 minute',updated_at=now()-interval '1 minute' where room_id='OWNPART1';
select set_config('test.part_room_activity',(select last_activity_at::text from public.communication_rooms where room_id='OWNPART1'),true);
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"d9222222-2222-4222-8222-222222222222","session_id":"d9222222-2222-4222-8222-222222222220"}', true);
select throws_ok($$select public.touch_owned_communication_room_session('OWNPART1',current_setting('test.part_host_generation')::uuid,null,false,false)$$,
  'communication_membership_generation_changed','nonmember cannot touch a host membership using its generation');
select set_config('test.part_generation_one',(select membership_generation::text
  from public.join_owned_communication_room_session('OWNPART1','d9333333-3333-4333-8333-333333333342',null,null,null,true,true)),true);
select results_eq($$select user_id,camera_enabled,mic_enabled from public.touch_owned_communication_room_session('OWNPART1',current_setting('test.part_generation_one')::uuid,null,false,false)$$,
  $$values ('d9222222-2222-4222-8222-222222222222'::text,false,false)$$,
  'non-host media write commits without attempting a host-only room write');
select results_eq($$select camera_enabled,mic_enabled,last_seen_at=now() from public.touch_owned_communication_room_session('OWNPART1',current_setting('test.part_generation_one')::uuid)$$,
  $$values (false,false,true)$$,'non-host heartbeat refreshes membership liveness and preserves muted state');
select is((select last_activity_at::text from public.communication_rooms where room_id='OWNPART1'),current_setting('test.part_room_activity'),
  'non-host heartbeat leaves host-owned room liveness unchanged');
select results_eq($$update public.communication_rooms set status='ended' where room_id='OWNPART1' returning room_id$$,
  $$select null::text where false$$,'non-host direct room mutation remains denied by the existing RLS policy');
select results_eq($$select camera_enabled,mic_enabled from public.touch_owned_communication_room_session('OWNPART1',current_setting('test.part_generation_one')::uuid,null,true,true)$$,
  $$values (true,true)$$,'non-host camera and microphone can re-enable after mute');
select throws_ok($$select public.touch_owned_communication_room_session('OWNPART1',current_setting('test.part_host_generation')::uuid,null,false,false)$$,
  'communication_membership_generation_changed','participant cannot use another member generation');
select set_config('test.part_generation_two',(select membership_generation::text
  from public.join_owned_communication_room_session('OWNPART1','d9333333-3333-4333-8333-333333333343',current_setting('test.part_generation_one')::uuid,null,null,true,true)),true);
select throws_ok($$select public.touch_owned_communication_room_session('OWNPART1',current_setting('test.part_generation_one')::uuid,null,false,false)$$,
  'communication_membership_generation_changed','retired participant generation cannot overwrite replacement media');
select results_eq($$select camera_enabled,mic_enabled from public.touch_owned_communication_room_session('OWNPART1',current_setting('test.part_generation_two')::uuid)$$,
  $$values (true,true)$$,'current participant generation retains replacement media intent');
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"d9111111-1111-4111-8111-111111111111","session_id":"d9111111-1111-4111-8111-111111111110"}', true);
select results_eq($$select user_id,camera_enabled,mic_enabled from public.touch_owned_communication_room_session('OWNPART1',current_setting('test.part_host_generation')::uuid)$$,
  $$values ('d9111111-1111-4111-8111-111111111111'::text,true,true)$$,'current host heartbeat retains its own media');
select ok((select last_activity_at=now() and host_user_id='d9111111-1111-4111-8111-111111111111' and status='active'
  from public.communication_rooms where room_id='OWNPART1'),'current host heartbeat still refreshes room liveness without changing authority');
reset role;
delete from auth.sessions where id='d9111111-1111-4111-8111-111111111110';
set local role authenticated;
select throws_ok($$select public.read_communication_room_admission('OWNGEN1')$$,
  'communication_room_current_session_required','revoked session cannot prepare new ownership');
select throws_ok($$select public.join_owned_communication_room_session('OWNGEN1','d9333333-3333-4333-8333-333333333335',current_setting('test.owner_generation_three')::uuid)$$,
  'communication_room_current_session_required','revoked session cannot acquire ownership');
select throws_ok($$select public.touch_owned_communication_room_session('OWNGEN1',current_setting('test.owner_generation_three')::uuid)$$,
  'communication_room_current_session_required','revoked session cannot write or heartbeat');
select throws_ok($$select public.broadcast_owned_communication_room_signal('OWNGEN1',current_setting('test.owner_generation_three')::uuid,'media:update','{"cameraOn":false,"micOn":false}')$$,
  'communication_room_current_session_required','revoked session cannot relay media despite a retained generation');
reset role;
set local role anon;
select throws_ok($$select public.read_communication_room_admission('OWNGEN1')$$,'42501',null,'anonymous admission read is denied');
select throws_ok($$select public.join_owned_communication_room_session('OWNGEN1','d9333333-3333-4333-8333-333333333335',null)$$,'42501',null,'anonymous owned join is denied');
select throws_ok($$select public.touch_owned_communication_room_session('OWNGEN1',current_setting('test.owner_generation_three')::uuid)$$,'42501',null,'anonymous owned media write is denied');
select throws_ok($$select public.broadcast_owned_communication_room_signal('OWNGEN1',current_setting('test.owner_generation_three')::uuid,'media:update','{"cameraOn":false,"micOn":false}')$$,'42501',null,'anonymous owned relay is denied');
reset role;

select * from finish();
rollback;
