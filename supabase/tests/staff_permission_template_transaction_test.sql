begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function('public','admin_mutate_staff_permission_template',
  array['text','text','uuid','text','text','timestamp with time zone','uuid'],'one transactional template endpoint');
select ok(has_function_privilege('authenticated',
  'public.admin_mutate_staff_permission_template(text,text,uuid,text,text,timestamptz,uuid)','EXECUTE'),
  'authenticated staff can enter the checked RPC');
select ok(not has_function_privilege('anon',
  'public.admin_mutate_staff_permission_template(text,text,uuid,text,text,timestamptz,uuid)','EXECUTE')
  and not has_function_privilege('service_role',
  'public.admin_mutate_staff_permission_template(text,text,uuid,text,text,timestamptz,uuid)','EXECUTE'),
  'anonymous and subjectless service clients cannot mutate templates');
select ok(not has_function_privilege('authenticated',
  'private.assert_staff_permission_template_authority(uuid,text,text[])','EXECUTE'),
  'internal authority helper is not an API');
select ok((select bool_and(relrowsecurity) from pg_class where oid in (
  'public.platform_staff_permission_grants'::regclass,'public.platform_admin_audit_logs'::regclass,
  'public.platform_break_glass_audit'::regclass)), 'existing permission and audit RLS remains enabled');

insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous) values
 ('a7300000-0000-4000-8000-000000000001','template-owner@example.test',now(),false,false),
 ('a7300000-0000-4000-8000-000000000002','template-manager@example.test',now(),false,false),
 ('a7300000-0000-4000-8000-000000000003','template-moderator@example.test',now(),false,false),
 ('a7300000-0000-4000-8000-000000000004','template-operator@example.test',now(),false,false),
 ('a7300000-0000-4000-8000-000000000005','template-member@example.test',now(),false,false);
insert into auth.sessions(id,user_id,not_after)
select ('a7400000-0000-4000-8000-'||right(id::text,12))::uuid,id,now()+interval '1 day'
from auth.users where id::text like 'a7300000-%';
insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,
 role_key,capability,session_generation,authority_source)
select s.user_id,public.wave1_sha256(s.user_id::text),d.document_key,d.version,d.market,
 coalesce(nullif(lower(trim(p.channel_role)),''),'member'),d.capability,s.id::text,'service_reconciliation'
from auth.sessions s left join public.user_profiles p on p.user_id=s.user_id::text
cross join public.wave1_legal_document_versions d where s.id::text like 'a7400000-%'
 and d.active and d.market='UNITED_STATES' and d.capability='account';
insert into public.platform_role_memberships(role,user_id,email,status,notes,granted_by) values
 ('owner','a7300000-0000-4000-8000-000000000001','template-owner@example.test','active','Synthetic template fixture','pgtap'),
 ('operator','a7300000-0000-4000-8000-000000000002','template-manager@example.test','active','Synthetic template fixture','pgtap'),
 ('moderator','a7300000-0000-4000-8000-000000000003','template-moderator@example.test','active','Synthetic template fixture','pgtap'),
 ('operator','a7300000-0000-4000-8000-000000000004','template-operator@example.test','active','Synthetic template fixture','pgtap');
insert into public.platform_staff_permission_grants(target_user_id,target_email,permission_key,status,reason) values
 ('a7300000-0000-4000-8000-000000000002','template-manager@example.test','staff_permission_templates','active','Synthetic template authority'),
 ('a7300000-0000-4000-8000-000000000003','template-moderator@example.test','evidence_export','active','Unrelated permission');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"a7300000-0000-4000-8000-000000000002","session_id":"a7400000-0000-4000-8000-000000000002"}',true);

set local role authenticated;
select lives_ok($$select public.admin_mutate_staff_permission_template('apply','template-moderator@example.test',
 'a7300000-0000-4000-8000-000000000003','moderator','Synthetic apply',now()+interval '1 hour')$$,
 'scoped template manager can apply to an existing Moderator');
reset role;
select is((select count(*)::int from public.platform_staff_permission_grants where
 target_user_id='a7300000-0000-4000-8000-000000000003' and status='active'),6,'all template keys plus unrelated grant');
select is((select count(*)::int from public.platform_admin_audit_logs where
 actor_user_id='a7300000-0000-4000-8000-000000000002' and action='staff_permission_template_apply'),1,'exactly one required apply audit');
select is((select count(*)::int from public.platform_role_memberships where
 user_id='a7300000-0000-4000-8000-000000000003'),1,'template never creates an operator role');
select lives_ok($$select public.admin_mutate_staff_permission_template('apply','template-operator@example.test',
 'a7300000-0000-4000-8000-000000000004','moderator','Synthetic compatibility')$$,'existing operators remain supported');
select lives_ok($$select public.admin_mutate_staff_permission_template('apply','template-moderator@example.test',
 'a7300000-0000-4000-8000-000000000003','senior_moderator','Synthetic senior')$$,'Senior Moderator accepts existing Moderator');
select lives_ok($$select public.admin_mutate_staff_permission_template('apply','template-moderator@example.test',
 'a7300000-0000-4000-8000-000000000003','moderator_support','Synthetic support')$$,'Moderator Support accepts existing Moderator');
select throws_ok($$select public.admin_mutate_staff_permission_template('apply','template-moderator@example.test',
 'a7300000-0000-4000-8000-000000000003','legal_operator','Synthetic wrong role')$$,
 'P0001','target_admin_required','non-Moderator templates retain operator scope');
select throws_ok($$select public.admin_mutate_staff_permission_template('apply','template-manager@example.test',
 'a7300000-0000-4000-8000-000000000002','moderator','Synthetic self grant')$$,
 '42501','staff_permission_template_self_denied','non-Owner self apply denied');
select throws_ok($$select public.admin_mutate_staff_permission_template('revoke','template-manager@example.test',
 'a7300000-0000-4000-8000-000000000002','moderator','Synthetic self revoke')$$,
 '42501','staff_permission_template_self_denied','non-Owner self revoke denied');
select throws_ok($$select public.admin_mutate_staff_permission_template('apply','template-moderator@example.test',
 'a7300000-0000-4000-8000-000000000004','moderator','Synthetic mismatched subject')$$,
 'P0001','staff_permission_template_subject_changed','email cannot nominate a different immutable subject');
select throws_ok($$select public.admin_mutate_staff_permission_template('apply','template-member@example.test',
 'a7300000-0000-4000-8000-000000000005','moderator','Synthetic no role')$$,
 'P0001','target_admin_required','templates cannot create a staff role');
select throws_ok($$select public.admin_mutate_staff_permission_template('apply','template-moderator@example.test',
 'a7300000-0000-4000-8000-000000000003','moderator','Synthetic expired',now()-interval '1 second')$$,
 'P0001','platform_staff_permission_expiry_invalid','expired template grants rejected');
select lives_ok($$select public.admin_mutate_staff_permission_template('revoke','template-moderator@example.test',
 'a7300000-0000-4000-8000-000000000003','moderator','Synthetic revoke')$$,'revoke succeeds');
select is((select status from public.platform_staff_permission_grants where
 target_user_id='a7300000-0000-4000-8000-000000000003' and permission_key='evidence_export'),'active','unrelated permission survives revoke');
select is((select count(*)::int from public.platform_staff_permission_grants where
 target_user_id='a7300000-0000-4000-8000-000000000003' and status='active' and permission_key in
 ('reports_review','content_moderation','admin.content.hide','admin.content.restore','admin.comment.moderate')),0,'only selected template keys revoked');

-- Real transaction rollback on a later permission write and either audit sink.
create temporary table template_snapshot as select to_jsonb(g) row from public.platform_staff_permission_grants g;
create function public.fixture_template_permission_failure() returns trigger language plpgsql as $$begin
 if new.permission_key='admin.comment.moderate' then raise exception 'synthetic_permission_failure';end if;return new;end$$;
create trigger fixture_template_permission_failure before insert or update on public.platform_staff_permission_grants
 for each row execute function public.fixture_template_permission_failure();
select throws_ok($$select public.admin_mutate_staff_permission_template('apply','template-moderator@example.test',
 'a7300000-0000-4000-8000-000000000003','moderator','Synthetic partial failure')$$,
 'P0001','synthetic_permission_failure','later permission failure rejects whole template');
select results_eq('select to_jsonb(g) from public.platform_staff_permission_grants g order by id',
 'select row from template_snapshot order by row->>''id''','later permission failure rolls back every earlier permission');
drop trigger fixture_template_permission_failure on public.platform_staff_permission_grants;
drop function public.fixture_template_permission_failure();
create function public.fixture_template_audit_failure() returns trigger language plpgsql as $$begin
 raise exception 'synthetic_audit_failure';end$$;
create trigger fixture_template_audit_failure before insert on public.platform_admin_audit_logs
 for each row execute function public.fixture_template_audit_failure();
select throws_ok($$select public.admin_mutate_staff_permission_template('apply','template-moderator@example.test',
 'a7300000-0000-4000-8000-000000000003','moderator','Synthetic audit failure')$$,
 'P0001','synthetic_audit_failure','required application audit failure rejects apply');
select results_eq('select to_jsonb(g) from public.platform_staff_permission_grants g order by id',
 'select row from template_snapshot order by row->>''id''','required audit failure rolls back every grant');
select throws_ok($$select public.admin_mutate_staff_permission_template('revoke','template-operator@example.test',
 'a7300000-0000-4000-8000-000000000004','moderator','Synthetic revoke failure')$$,
 'P0001','synthetic_audit_failure','required application audit failure rejects revoke');
select results_eq('select to_jsonb(g) from public.platform_staff_permission_grants g order by id',
 'select row from template_snapshot order by row->>''id''','failed revoke leaves every prior grant active');
drop trigger fixture_template_audit_failure on public.platform_admin_audit_logs;

select set_config('request.jwt.claims','{"role":"authenticated","sub":"a7300000-0000-4000-8000-000000000001","session_id":"a7400000-0000-4000-8000-000000000001"}',true);
select lives_ok($$select public.admin_mutate_staff_permission_template('apply','template-moderator@example.test',
 'a7300000-0000-4000-8000-000000000003','moderator',null)$$,'Owner normal gets default reason');
select is((select count(*)::int from public.platform_admin_audit_logs where actor_user_id='a7300000-0000-4000-8000-000000000001'),0,
 'Owner normal action suppresses application audit');
insert into public.platform_first_owner_authority(owner_membership_id,owner_user_id,owner_email,established_by,established_reason)
select id,user_id,email,'pgtap','Synthetic first owner' from public.platform_role_memberships
where user_id='a7300000-0000-4000-8000-000000000001';
insert into public.platform_break_glass_sessions(actor_user_id,actor_email,actor_role,status,reason,expires_at)
values('a7300000-0000-4000-8000-000000000001','template-owner@example.test','owner','active','Synthetic emergency',now()+interval '1 hour');
select lives_ok($$select public.admin_mutate_staff_permission_template('apply','template-moderator@example.test',
 'a7300000-0000-4000-8000-000000000003','moderator','Synthetic emergency action')$$,'Owner Break Glass template works');
select is((select count(*)::int from public.platform_break_glass_audit where actor_user_id='a7300000-0000-4000-8000-000000000001' and action='owner_action'),1,
 'Owner Break Glass requires emergency audit');
select is((select count(*)::int from public.platform_admin_audit_logs where actor_user_id='a7300000-0000-4000-8000-000000000001'),1,
 'Owner Break Glass also requires application audit');
truncate template_snapshot;
insert into template_snapshot select to_jsonb(g) from public.platform_staff_permission_grants g;
create trigger fixture_template_audit_failure before insert on public.platform_break_glass_audit
 for each row execute function public.fixture_template_audit_failure();
select throws_ok($$select public.admin_mutate_staff_permission_template('revoke','template-moderator@example.test',
 'a7300000-0000-4000-8000-000000000003','moderator','Synthetic emergency failure')$$,
 'P0001','synthetic_audit_failure','Break Glass sink failure rejects operation');
select results_eq('select to_jsonb(g) from public.platform_staff_permission_grants g order by id',
 'select row from template_snapshot order by row->>''id''','Break Glass failure rolls back grants');
select is((select count(*)::int from public.platform_admin_audit_logs where actor_user_id='a7300000-0000-4000-8000-000000000001'),1,
 'Break Glass failure rolls back earlier application audit');

select * from finish();
rollback;
