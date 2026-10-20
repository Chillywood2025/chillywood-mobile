-- Run only on a fully migrated disposable database; every fixture rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select ok(not has_function_privilege('anon','public.admin_list_content_inspection_subject_targets(uuid,text,text,uuid,timestamptz,uuid)','EXECUTE'),'anonymous cannot browse subject metadata');
select ok(not has_function_privilege('service_role','public.admin_list_content_inspection_subject_targets(uuid,text,text,uuid,timestamptz,uuid)','EXECUTE'),'service role has no direct browse grant');
insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous)
select ('b3000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'browse-'||n||'@example.test',now(),false,false from generate_series(1,4) n;
insert into auth.sessions(id,user_id,not_after)
select ('b4000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  ('b3000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,now()+interval '1 hour' from generate_series(1,4) n;
insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
select s.user_id,public.wave1_sha256(s.user_id::text),d.document_key,d.version,d.market,
  coalesce(nullif(lower(trim(p.channel_role)),''),'member'),d.capability,s.id::text,'service_reconciliation'
from auth.sessions s left join public.user_profiles p on p.user_id=s.user_id::text
cross join public.wave1_legal_document_versions d
where s.id::text like 'b4000000-%' and d.active and d.market='UNITED_STATES' and d.capability='account';
insert into public.platform_role_memberships(role,user_id,email,status,notes,granted_by)
select role,'b3000000-0000-4000-8000-'||lpad(n::text,12,'0'),'browse-'||n||'@example.test','active','Synthetic browse fixture','pgtap'
from (values(1,'owner'),(2,'super_admin'),(3,'operator')) r(n,role);
insert into public.profile_posts(id,user_id,body,created_at,visibility,moderation_status,deleted_at)
select ('b5000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'b3000000-0000-4000-8000-000000000004','Private body must never appear',
  '2026-10-01 00:00:00+00'::timestamptz,'draft','removed',case when n=52 then now() end
from generate_series(1,52) n;
insert into public.profile_posts(id,user_id,body,created_at)
values('b5000000-0000-4000-8000-000000000053','b3000000-0000-4000-8000-000000000001','Owner body',now());
create function pg_temp.browse_claim(n integer) returns void language sql as $$
  select set_config('request.jwt.claims',jsonb_build_object('sub','b3000000-0000-4000-8000-'||lpad(n::text,12,'0'),
    'session_id','b4000000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated')::text,true)::text;
$$;
select pg_temp.browse_claim(1);
set local role authenticated;
select throws_ok($$select public.admin_list_content_inspection_subject_targets('b3000000-0000-4000-8000-000000000004','profile_post','Synthetic review',gen_random_uuid())$$,'42501','content_inspection_disabled','Owner browse denied while disabled');
reset role;
update private.content_inspection_settings set enabled=true;
set local role authenticated;
select set_config('test.browse.page',public.admin_list_content_inspection_subject_targets('b3000000-0000-4000-8000-000000000004','profile_post','Synthetic review',gen_random_uuid())::text,true);
select is(jsonb_array_length(current_setting('test.browse.page')::jsonb->'targets'),50,'first page bounded to 50');
select is(current_setting('test.browse.page')::jsonb->>'hasMore','true','51st current row indicates another page');
select is(current_setting('test.browse.page')::jsonb->'targets'->0->>'targetId','b5000000-0000-4000-8000-000000000051','deleted and different-author rows excluded');
select is(current_setting('test.browse.page')::jsonb->'targets'->0,
  jsonb_build_object('targetId','b5000000-0000-4000-8000-000000000051','targetType','profile_post','createdAt',
    (current_setting('test.browse.page')::jsonb->'targets'->0->'createdAt'),'label','Profile post'),'metadata has exactly four safe fields');
select set_config('test.browse.next',public.admin_list_content_inspection_subject_targets(
  'b3000000-0000-4000-8000-000000000004','profile_post','Synthetic review',gen_random_uuid(),
  (current_setting('test.browse.page')::jsonb->'nextCursor'->>'createdAt')::timestamptz,
  (current_setting('test.browse.page')::jsonb->'nextCursor'->>'id')::uuid)::text,true);
select is(jsonb_array_length(current_setting('test.browse.next')::jsonb->'targets'),1,'composite cursor retains last timestamp-tied row');
select is(current_setting('test.browse.next')::jsonb->'targets'->0->>'targetId','b5000000-0000-4000-8000-000000000001','second page neither repeats nor skips tied IDs');
select is(current_setting('test.browse.next')::jsonb->'nextCursor','null'::jsonb,'terminal page has null cursor');
select throws_ok($$select public.admin_list_content_inspection_subject_targets('b3000000-0000-4000-8000-000000000004','profile_post','Synthetic review',gen_random_uuid(),now(),null)$$,'22023','content_inspection_invalid_cursor','partial cursor rejected');
select throws_ok($$select public.admin_list_content_inspection_subject_targets('b3000000-0000-4000-8000-000000000004','arbitrary_table','Synthetic review',gen_random_uuid())$$,'22023','content_inspection_unsupported_target','arbitrary adapters rejected');
reset role;
select is((select count(*) from private.content_inspection_access_events where actor='b3000000-0000-4000-8000-000000000001' and operation='list_subject_targets'),0::bigint,'Owner browse exempt from inspection events');
select pg_temp.browse_claim(2);
set local role authenticated;
select lives_ok($$select public.admin_list_content_inspection_subject_targets('b3000000-0000-4000-8000-000000000004','profile_post','Synthetic review',gen_random_uuid())$$,'SuperAdmin can browse ordinary subject');
select throws_ok($$select public.admin_list_content_inspection_subject_targets('b3000000-0000-4000-8000-000000000001','profile_post','Synthetic review',gen_random_uuid())$$,'42501','content_inspection_denied','SuperAdmin cannot browse Owner subject');
reset role;
select is((select count(*) from private.content_inspection_access_events where actor='b3000000-0000-4000-8000-000000000002' and operation='list_subject_targets'),1::bigint,'SuperAdmin browse audited');
select pg_temp.browse_claim(3);
set local role authenticated;
select throws_ok($$select public.admin_list_content_inspection_subject_targets('b3000000-0000-4000-8000-000000000004','profile_post','Synthetic review',gen_random_uuid())$$,'42501','content_inspection_denied','operator cannot discover targets by subject');
reset role;
update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id='b4000000-0000-4000-8000-000000000001';
select pg_temp.browse_claim(1);
set local role authenticated;
select throws_ok($$select public.admin_list_content_inspection_subject_targets('b3000000-0000-4000-8000-000000000004','profile_post','Synthetic review',gen_random_uuid())$$,'42501','content_inspection_denied','expired exact Owner session denied');
reset role;
select * from finish();
rollback;
