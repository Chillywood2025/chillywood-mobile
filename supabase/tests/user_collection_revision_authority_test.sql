begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function('public','read_my_collection_state',array['text','text','integer'],
  'collection reads expose server revisions and retained tombstones');
select has_function('public','mutate_my_collection_state',array['text','text','uuid','text','jsonb'],
  'collection writes require exact operation identity and expected revision');
select ok(not has_table_privilege('authenticated','public.user_list','INSERT'), 'Saved direct insert is closed');
select ok(not has_table_privilege('authenticated','public.user_list','UPDATE'), 'Saved direct update is closed');
select ok(not has_table_privilege('authenticated','public.user_list','DELETE'), 'Saved direct delete is closed');
select ok(not has_table_privilege('authenticated','public.watch_history','INSERT'), 'progress direct insert is closed');
select ok(not has_table_privilege('authenticated','public.watch_history','UPDATE'), 'progress direct update is closed');
select ok(not has_table_privilege('authenticated','public.watch_history','DELETE'), 'progress direct delete is closed');
select ok(has_table_privilege('authenticated','public.user_list','SELECT'), 'existing Saved SELECT remains available under RLS');
select ok(has_table_privilege('authenticated','public.watch_history','SELECT'), 'existing progress SELECT remains available under RLS');
select ok(not has_function_privilege('anon','public.mutate_my_collection_state(text,text,uuid,text,jsonb)','EXECUTE'), 'anonymous mutation is unavailable');
select ok(not has_function_privilege('service_role','public.mutate_my_collection_state(text,text,uuid,text,jsonb)','EXECUTE'), 'caller authority cannot be impersonated by the service role');
select ok(not has_table_privilege('authenticated','private.user_collection_operation_receipts','SELECT'), 'raw operation receipts are private');
select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class
  where oid in ('private.user_collection_states'::regclass,'private.user_collection_operation_receipts'::regclass)),
  'state and receipts enforce RLS');

insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous) values
  ('7a000000-0000-4000-8000-000000000001','collection-one@example.test',now(),false,false),
  ('7a000000-0000-4000-8000-000000000002','collection-two@example.test',now(),false,false);
insert into auth.sessions(id,user_id) values
  ('7b000000-0000-4000-8000-000000000001','7a000000-0000-4000-8000-000000000001'),
  ('7b000000-0000-4000-8000-000000000002','7a000000-0000-4000-8000-000000000002');
-- Current legal acceptance is bound to each real fixture session. Do not turn
-- a user/session row alone into a substitute for the deployed account graph.
insert into public.wave1_legal_acceptances(
  user_id,subject_hash,document_key,document_version,market,role_key,
  capability,session_generation,authority_source)
select s.user_id,public.wave1_sha256(s.user_id::text),d.document_key,d.version,d.market,
  coalesce(nullif(lower(trim(p.channel_role)),''),'member'),d.capability,s.id::text,'service_reconciliation'
from auth.sessions s
left join public.user_profiles p on p.user_id=s.user_id::text
cross join public.wave1_legal_document_versions d
where s.id in ('7b000000-0000-4000-8000-000000000001','7b000000-0000-4000-8000-000000000002')
  and d.active and d.market='UNITED_STATES' and d.capability='account';
insert into public.user_list(user_id,title_id,updated_at)
  values('7a000000-0000-4000-8000-000000000001','collection-legacy','2026-01-02T00:00:00Z');
insert into public.watch_history(user_id,title_id,play_count,completed)
  values('7a000000-0000-4000-8000-000000000001','collection-watch',5,true);
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"7a000000-0000-4000-8000-000000000001","session_id":"7b000000-0000-4000-8000-000000000001"}',true);
set local role authenticated;

select is((select revision from public.read_my_collection_state('saved') where title_id='collection-legacy'),'0',
  'existing data starts at revision zero without manufactured edits');
select is((public.mutate_my_collection_state('saved','collection-film','7c000000-0000-4000-8000-000000000001','0',
  '{"id":"collection-film"}'))->>'status','applied','first save is acknowledged');
select is((public.mutate_my_collection_state('saved','collection-film','7c000000-0000-4000-8000-000000000002','1',null))->>'revision',
  '2','remove advances a durable revision');
select is((public.mutate_my_collection_state('saved','collection-film','7c000000-0000-4000-8000-000000000003','0',
  '{"id":"collection-film"}'))->>'status','conflict','an older save cannot resurrect the removed title');
select is((select revision from public.read_my_collection_state('saved') where title_id='collection-film'),'2',
  'the removed title still has a readable revision');
select ok((select value is null from public.read_my_collection_state('saved') where title_id='collection-film'),
  'the retained Saved tombstone is null-valued');
select is((public.mutate_my_collection_state('saved','collection-film','7c000000-0000-4000-8000-000000000001','0',
  '{"id":"collection-film"}'))->>'revision','1','an exact retry returns its original acknowledgment');
select is((select revision from public.read_my_collection_state('saved') where title_id='collection-film'),'2',
  'an old receipt does not replay its side effect');
select throws_ok($$select public.mutate_my_collection_state('saved','collection-film',
  '7c000000-0000-4000-8000-000000000001','0',null)$$,
  '22023','collection_operation_key_conflict','changed payload cannot reuse a prior UUID');
select throws_ok($$select public.mutate_my_collection_state('saved','__proto__',
  '7c000000-0000-4000-8000-000000000004','0','{"id":"__proto__"}')$$,
  '22023','collection_request_invalid','reserved object keys cannot enter a client collection map');
select throws_ok($$select public.mutate_my_collection_state('saved','collection-private',
  '7c000000-0000-4000-8000-000000000005','0','{"id":"collection-private","posterUrl":"https://example.test/private"}')$$,
  '22023','collection_saved_value_invalid','arbitrary media URLs cannot enter operation receipts');

select is((public.mutate_my_collection_state('watch','collection-watch','7c000000-0000-4000-8000-000000000010','0',
  '{"positionMillis":0,"completed":false,"incrementPlayCount":true}'))->'value'->>'playCount','6',
  'an accepted start increments atomically');
select is((public.mutate_my_collection_state('watch','collection-watch','7c000000-0000-4000-8000-000000000010','0',
  '{"positionMillis":0,"completed":false,"incrementPlayCount":true}'))->'value'->>'playCount','6',
  'exact retry does not count the same start twice');
select is((public.mutate_my_collection_state('watch','collection-watch','7c000000-0000-4000-8000-000000000011','1',
  '{"positionMillis":0,"completed":true}'))->>'status','applied','completion advances server authority');
select is((public.mutate_my_collection_state('watch','collection-watch','7c000000-0000-4000-8000-000000000012','1',
  '{"positionMillis":500,"completed":false}'))->>'status','conflict','trailing stale progress cannot undo completion');
select is((select value->>'completed' from public.read_my_collection_state('watch') where title_id='collection-watch'),
  'true','completed progress participates in reconciliation');

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"7a000000-0000-4000-8000-000000000002","session_id":"7b000000-0000-4000-8000-000000000002"}',true);
select is((select count(*)::integer from public.read_my_collection_state('saved')),0,'another account cannot read these revisions');
select is((public.mutate_my_collection_state('saved','collection-film','7c000000-0000-4000-8000-000000000001','0',
  '{"id":"collection-film"}'))->>'status','applied','operation UUID namespace is actor-bound');
reset role;
delete from auth.sessions where id='7b000000-0000-4000-8000-000000000002';
set local role authenticated;
select throws_ok($$select * from public.read_my_collection_state('saved')$$,'42501','collection_current_session_required',
  'revoked exact session cannot read through the definer RPC');
select throws_ok($$select public.mutate_my_collection_state('saved','collection-film',
  '7c000000-0000-4000-8000-000000000001','0','{"id":"collection-film"}')$$,
  '42501','collection_current_session_required','revocation also blocks exact receipt replay');

reset role;
select * from finish();
rollback;
