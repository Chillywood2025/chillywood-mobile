begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- BEGIN FIXTURES: also exercised by the local PostgreSQL/WASM regression.
insert into auth.users (id,email,email_confirmed_at,is_sso_user,is_anonymous) values
 ('97000000-0000-4000-8000-000000000001','history-owner@example.test',now(),false,false),
 ('97000000-0000-4000-8000-000000000002','history-user@example.test',now(),false,false);
insert into auth.sessions (id,user_id) values
 ('97100000-0000-4000-8000-000000000001','97000000-0000-4000-8000-000000000001'),
 ('97100000-0000-4000-8000-000000000002','97000000-0000-4000-8000-000000000002');
insert into public.wave1_legal_acceptances (user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
select fixture.user_id,public.wave1_sha256(fixture.user_id::text),document.document_key,document.version,document.market,
 coalesce(nullif(lower(trim(profile.channel_role)),''),'member'),document.capability,fixture.id::text,'service_reconciliation'
from auth.sessions fixture left join public.user_profiles profile on profile.user_id=fixture.user_id::text
cross join public.wave1_legal_document_versions document
where fixture.id in ('97100000-0000-4000-8000-000000000001','97100000-0000-4000-8000-000000000002')
 and document.active and document.market='UNITED_STATES' and document.capability='account';
insert into public.platform_role_memberships (role,user_id,email,status,notes,granted_by)
values ('owner','97000000-0000-4000-8000-000000000001','history-owner@example.test','active','History fixtures','pgtap');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"97000000-0000-4000-8000-000000000001","session_id":"97100000-0000-4000-8000-000000000001"}',true);
insert into public.safety_reports(id,reporter_user_id,target_type,target_id,category,status,created_at)
select 970000000+n,'97000000-0000-4000-8000-000000000001','participant','history-target-'||n,'abuse',
 case when n>125 then 'actioned' else 'needs_review' end,'2026-10-20T02:00:00.123456Z'::timestamptz
from generate_series(1,160) n;
update public.safety_reports set status='actioned' where id between 970000126 and 970000160;
insert into public.platform_admin_audit_logs(action,action_category,target_type,target_id,metadata,created_at)
select 'report_review','moderation','participant','history-target-1',jsonb_build_object('report_id',970000001),
 '2026-10-20T02:00:00.123456Z'::timestamptz from generate_series(1,251);
insert into public.dmca_cases(id,case_number,reporter_name,reporter_email,copyrighted_work_description,electronic_signature,
 uploader_user_id,status,created_at,is_test_case,allegedly_infringing_content_id)
select ('97200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'history-fixture-'||n,'Fixture','fixture@example.test','Fixture work','Fixture',
 '97000000-0000-4000-8000-000000000002',case when n=251 then 'closed' else 'received' end,
 '2026-10-20T02:00:00.123456Z'::timestamptz,n=252,'fixture-content-'||n
from generate_series(1,252) n;
insert into public.dmca_strikes(user_id,dmca_case_id,content_type,content_id,reason)
select '97000000-0000-4000-8000-000000000002','97200000-0000-4000-8000-000000000001','other','fixture','Fixture strike'
from generate_series(1,601);
insert into public.dmca_audit_log(dmca_case_id,event_type,actor_role,created_at)
select '97200000-0000-4000-8000-000000000001','case_updated','admin','2026-10-20T02:00:00Z' from generate_series(1,601);
insert into public.dmca_audit_log(id,dmca_case_id,event_type,actor_role,created_at)
values ('97400000-0000-4000-8000-000000000001','97200000-0000-4000-8000-000000000002','case_created','admin','2026-10-19T01:00:00Z'),
 ('97400000-0000-4000-8000-000000000002','97200000-0000-4000-8000-000000000002','admin_note_added','admin','2026-10-19T01:00:00Z');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"97000000-0000-4000-8000-000000000001","session_id":"97100000-0000-4000-8000-000000000001"}',true);
-- END FIXTURES

set local role authenticated;
select ok(not has_function_privilege('anon','public.list_admin_reports_page(text,text,integer)','execute'),'anonymous reports RPC denied');
select ok(not has_function_privilege('anon','public.list_admin_dmca_cases_page(text,text,text,integer,boolean)','execute'),'anonymous DMCA RPC denied');
select ok(not has_function_privilege('anon','public.get_admin_dmca_case_summary(boolean)','execute'),'anonymous DMCA summary denied');
select ok(not has_function_privilege('anon','public.list_admin_report_audit_events_page(bigint,text,integer)','execute'),'anonymous report detail history denied');
select is((public.list_admin_reports_page('needs_review',null,50)->'items'->0->>'id')::bigint,970000125::bigint,'source status filter excludes 35 newer resolved reports');
select is((public.list_admin_dmca_cases_page('all','history-fixture-2',null,50,false)->'items'->0->>'active_strike_count')::integer,601,'all 601 active uploader strikes are counted');
select is(public.list_admin_dmca_cases_page('all','history-fixture-2',null,50,false)->'items'->-1->>'last_action','admin_note_added','per-case latest action survives 601 other-case events');
select throws_ok($$select public.list_admin_reports_page('all','bad',25)$$,'22023','invalid_history_cursor','malformed cursor rejected');
select throws_ok($$select public.list_admin_reports_page('all','{"v":1,"scope":{"source":"reports","filter":"all"},"createdAt":"yesterday","id":"1"}',25)$$,'22023','invalid_history_cursor','relative timestamp cursor rejected');
select throws_ok($$select public.list_admin_reports_page('all',public.list_admin_reports_page('needs_review',null,50)->>'nextCursor',50)$$,'22023','invalid_history_cursor','cursor cannot cross filters');

create temporary table history_report_pages as
with recursive pages(n,page) as (
 select 1,public.list_admin_reports_page('needs_review',null,50)
 union all select n+1,public.list_admin_reports_page('needs_review',page->>'nextCursor',50)
 from pages where (page->>'hasMore')::boolean and n<10
) select * from pages;
select is((select count(*)::integer from history_report_pages),3,'reports traverse three tied pages');
select is((select count(distinct item->>'id')::integer from history_report_pages,jsonb_array_elements(page->'items') item),125,'report boundaries omit no tied rows');
select is((select page->>'nextCursor' from history_report_pages order by n desc limit 1),null::text,'report terminal page has no cursor');
create temporary table history_report_audit_pages as
with recursive pages(n,page) as (
 select 1,public.list_admin_report_audit_events_page(970000001,null,100)
 union all select n+1,public.list_admin_report_audit_events_page(970000001,page->>'nextCursor',100)
 from pages where (page->>'hasMore')::boolean and n<10
) select * from pages;
select is((select count(distinct item->>'id')::integer from history_report_audit_pages,jsonb_array_elements(page->'items') item),251,'report detail history traverses beyond the legacy 25-row cap');

create temporary table history_dmca_pages as
with recursive pages(n,page) as (
 select 1,public.list_admin_dmca_cases_page('all','history-fixture-',null,50,false)
 union all select n+1,public.list_admin_dmca_cases_page('all','history-fixture-',page->>'nextCursor',50,false)
 from pages where (page->>'hasMore')::boolean and n<10
) select * from pages;
select is((select count(*)::integer from history_dmca_pages),6,'DMCA traverses six tied pages');
select is((select count(distinct item->>'id')::integer from history_dmca_pages,jsonb_array_elements(page->'items') item),251,'all non-test cases are reachable');
select is((public.get_admin_dmca_case_summary(false)->>'total')::integer,251,'summary exceeds legacy 200-row cap');
select is((public.get_admin_dmca_case_summary(false)->>'priority')::integer,251,'repeat uploader counts include closed priority case');
select is((public.get_admin_dmca_case_summary(true)->>'total')::integer,252,'test-case inclusion is explicit');
select ok((select relrowsecurity from pg_class where oid='public.dmca_cases'::regclass),'DMCA RLS stays enabled');
select ok(not (select prosecdef from pg_proc where oid='public.list_admin_dmca_cases_page(text,text,text,integer,boolean)'::regprocedure),'DMCA pagination retains invoker RLS');

reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"97000000-0000-4000-8000-000000000002","session_id":"97100000-0000-4000-8000-000000000002"}',true);
set local role authenticated;
select throws_ok($$select public.list_admin_reports_page()$$,'P0001','admin_reports_permission_denied','ordinary user report queue denied');
select throws_ok($$select public.list_admin_dmca_cases_page()$$,'P0001','dmca_owner_or_scoped_staff_required','ordinary user DMCA queue denied');
select throws_ok($$select public.get_admin_dmca_case_summary()$$,'P0001','dmca_owner_or_scoped_staff_required','ordinary user global aggregates denied');
select throws_ok($$select public.list_admin_report_audit_events_page(970000001)$$,'P0001','admin_reports_permission_denied','ordinary user report audit denied');
reset role;
select * from finish();
rollback;
