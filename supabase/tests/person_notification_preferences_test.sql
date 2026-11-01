begin;
select no_plan();
insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at) values
 ('ed410000-0000-4000-8000-000000000001',false,false,now()),
 ('ed410000-0000-4000-8000-000000000002',false,false,now());
insert into auth.sessions(id,user_id) values
 ('ed411000-0000-4000-8000-000000000001','ed410000-0000-4000-8000-000000000001'),
 ('ed411000-0000-4000-8000-000000000002','ed410000-0000-4000-8000-000000000002');
insert into public.user_profiles(user_id,username,display_name) values
 ('ed410000-0000-4000-8000-000000000001','person_pref_viewer','Viewer'),
 ('ed410000-0000-4000-8000-000000000002','person_pref_actor','Exact Member')
 on conflict(user_id) do update set username=excluded.username,display_name=excluded.display_name;
insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,
 role_key,capability,session_generation,authority_source)
 select s.user_id,public.wave1_sha256(s.user_id::text),d.document_key,d.version,d.market,'member',d.capability,
 s.id::text,'service_reconciliation' from auth.sessions s cross join public.wave1_legal_document_versions d
 where s.user_id::text like 'ed410000-%' and d.active and d.market='UNITED_STATES' and d.capability='account';

select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.person_notification_preferences'::regclass),
 'person preferences retain FORCE RLS');
select ok(not has_table_privilege('authenticated','public.person_notification_preferences','SELECT'), 'no direct reads bypass current-session RPC');
select ok(not has_table_privilege('authenticated','public.person_notification_preferences','UPDATE'), 'no direct writes bypass CAS');
select ok(not has_function_privilege('anon','public.read_person_notification_preferences(uuid)','EXECUTE'), 'anonymous cannot read preferences');
select ok(not has_function_privilege('authenticated','private.enqueue_confirmed_live_room_join()','EXECUTE'), 'clients cannot manufacture joins');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='private.live_room_join_qualifications'::regclass), 'qualification claims retain FORCE RLS');
select ok(not has_table_privilege('authenticated','private.live_room_join_qualifications','INSERT'), 'clients cannot forge qualification claims');
select ok(not has_table_privilege('authenticated','private.live_room_join_qualifications','DELETE'), 'clients cannot reset consumed attendance');
select ok(not has_table_privilege('service_role','private.live_room_join_qualifications','UPDATE'), 'qualification ledger is producer-owned');
select ok(not has_function_privilege('service_role','public.claim_notification_activity_batch_pre_join_retirement(integer)','EXECUTE'), 'worker cannot bypass qualification retirement');
select ok(has_function_privilege('service_role','public.claim_notification_activity_batch(integer)','EXECUTE'), 'existing worker retains its bounded claim entry');
select ok(not has_function_privilege('service_role','public.read_my_notification_display_context_pre_live_join(uuid[])','EXECUTE'), 'old display wrapper is not exposed');

set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"ed410000-0000-4000-8000-000000000001","session_id":"ed411000-0000-4000-8000-000000000001"}',true);
select is(public.read_person_notification_preferences('ed410000-0000-4000-8000-000000000002')->>'joinedLive','false','attendance defaults OFF');
select is(public.read_person_notification_preferences('ed410000-0000-4000-8000-000000000002')->>'liveStarts',null::text,'starts preserve relationship default');
select is(public.set_person_notification_preferences('ed410000-0000-4000-8000-000000000002',false,true,true,0)->>'revision','1','exact first revision accepted');
select throws_ok($$select public.set_person_notification_preferences('ed410000-0000-4000-8000-000000000002',true,false,false,0)$$,
 'P0001','person_notification_conflict','stale revision cannot override newer intent');
select is(public.read_person_notification_preferences('ed410000-0000-4000-8000-000000000002')->>'joinedLive','true','conflict preserves prior acknowledged choice');
select is(public.read_person_notification_preferences('ed410000-0000-4000-8000-000000000002')->>'following','false','notification choice does not follow actor');
select is(public.read_person_notification_preferences('ed410000-0000-4000-8000-000000000002')->>'circle','false','notification choice does not create Circle membership');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"ed410000-0000-4000-8000-000000000001","session_id":"ed411000-0000-4000-8000-000000000002"}',true);
select throws_ok($$select public.read_person_notification_preferences('ed410000-0000-4000-8000-000000000002')$$,
 'P0001','person_notification_access_required','another account session cannot read or adopt preferences');
reset role;
select is((select count(*)::int from public.person_notification_preferences where user_id='ed410000-0000-4000-8000-000000000001'),1,'one exact viewer actor preference row');
select * from finish();
rollback;
