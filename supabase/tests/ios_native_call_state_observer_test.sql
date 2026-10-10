begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select ok((select relrowsecurity and relforcerowsecurity from pg_class
  where oid = 'public.ios_native_call_state_issuances'::regclass), 'issuance RLS is forced');
select ok((select relrowsecurity and relforcerowsecurity from pg_class
  where oid = 'public.ios_native_call_state_connections'::regclass), 'connection RLS is forced');
select ok(not has_table_privilege(role_name, 'public.ios_native_call_state_issuances', 'SELECT,INSERT,UPDATE,DELETE'),
  role_name || ' cannot directly access issuance capabilities')
from unnest(array['anon','authenticated','service_role']) role_name;
select ok(not has_function_privilege('authenticated',
  'public.whole_app_claim_ios_call_state_observer(uuid,text,uuid,uuid)', 'EXECUTE'), 'clients cannot claim directly');
select ok(has_function_privilege('service_role',
  'public.whole_app_claim_ios_call_state_observer(uuid,text,uuid,uuid)', 'EXECUTE'), 'only the verifier can claim');
select ok(not has_function_privilege('service_role',
  'public.whole_app_current_ios_call_state_observer(uuid,text)', 'EXECUTE'), 'internal binding read is not exposed');

insert into auth.users(id,is_sso_user,is_anonymous) values
 ('c5100000-0000-4000-8000-000000000001',false,false),
 ('c5100000-0000-4000-8000-000000000002',false,false);
insert into auth.sessions(id,user_id) values
 ('c5100000-0000-4000-8000-000000000003','c5100000-0000-4000-8000-000000000002');
select set_config('request.jwt.claims',
 '{"role":"authenticated","sub":"c5100000-0000-4000-8000-000000000002","session_id":"c5100000-0000-4000-8000-000000000003"}',true);
select is(public.whole_app_register_ios_voip_push_token(
 'c5100000-0000-4000-8000-000000000002','c5100000-0000-4000-8000-000000000002',
 'c5100000-0000-4000-8000-000000000003','observer-pgtap-install','development',
 repeat('7',64),repeat('8',64),'observer-pgtap-register','1.0.0','1')->>'status',
 'registered','fixture registers through actual session-bound token authority');
select set_config('request.jwt.claims',
 '{"role":"authenticated","sub":"c5100000-0000-4000-8000-000000000001"}',true);
insert into public.chat_threads(id,thread_kind,participant_pair_key,created_by) values
 ('c5100000-0000-4000-8000-000000000004','direct',
 'c5100000-0000-4000-8000-000000000001::c5100000-0000-4000-8000-000000000002',
 'c5100000-0000-4000-8000-000000000001');
insert into public.chat_thread_members(thread_id,user_id) values
 ('c5100000-0000-4000-8000-000000000004','c5100000-0000-4000-8000-000000000001'),
 ('c5100000-0000-4000-8000-000000000004','c5100000-0000-4000-8000-000000000002');
insert into public.chat_call_invites(id,thread_id,caller_user_id,callee_user_id,call_type,status,expires_at) values
 ('c5100000-0000-4000-8000-000000000005','c5100000-0000-4000-8000-000000000004',
 'c5100000-0000-4000-8000-000000000001','c5100000-0000-4000-8000-000000000002',
 'voice','ringing',clock_timestamp()+interval '90 seconds');
insert into public.voip_push_delivery_attempts(id,dispatch_key,call_invite_id,recipient_user_id,
 apns_environment,status,attempt_count,voip_push_token_id)
select 'c5100000-0000-4000-8000-000000000006','observer-pgtap-attempt',
 'c5100000-0000-4000-8000-000000000005','c5100000-0000-4000-8000-000000000002',
 'development','attempted',1,id from public.user_voip_push_tokens where install_id='observer-pgtap-install';
select is(public.whole_app_issue_ios_call_state_observer(
 'c5100000-0000-4000-8000-000000000007','c5100000-0000-4000-8000-000000000006',1,repeat('a',64))->>'observerId',
 'c5100000-0000-4000-8000-000000000007','actual issued capability binds the current invite/session/token');
select is(public.whole_app_issue_ios_call_state_observer(
 'c5100000-0000-4000-8000-000000000008','c5100000-0000-4000-8000-000000000006',1,repeat('b',64)),
 null::jsonb,'a repeated dispatch attempt cannot issue another capability');
select is(public.whole_app_claim_ios_call_state_observer(
 'c5100000-0000-4000-8000-000000000007',repeat('b',64),'c5100000-0000-4000-8000-000000000010',
 'c5100000-0000-4000-8000-000000000020'),null::jsonb,'wrong secret cannot claim');
select is(public.whole_app_claim_ios_call_state_observer(
 'c5100000-0000-4000-8000-000000000007',repeat('a',64),'c5100000-0000-4000-8000-000000000010',
 'c5100000-0000-4000-8000-000000000020')->>'status','ringing','exact first connection observes ringing');
select is(public.whole_app_claim_ios_call_state_observer(
 'c5100000-0000-4000-8000-000000000007',repeat('a',64),'c5100000-0000-4000-8000-000000000010',
 'c5100000-0000-4000-8000-000000000020'),null::jsonb,'same connection cannot replay admission');
select is(public.whole_app_claim_ios_call_state_observer(
 'c5100000-0000-4000-8000-000000000007',repeat('a',64),'c5100000-0000-4000-8000-000000000011',
 'c5100000-0000-4000-8000-000000000021'),null::jsonb,'replacement native generation cannot borrow capability');
select is(public.whole_app_claim_ios_call_state_observer(
 'c5100000-0000-4000-8000-000000000007',repeat('a',64),'c5100000-0000-4000-8000-000000000011',
 'c5100000-0000-4000-8000-000000000020')->>'status','ringing','same-generation reconnect is bounded but permitted');
select is(public.whole_app_read_ios_call_state_observer(
 'c5100000-0000-4000-8000-000000000007',repeat('a',64),'c5100000-0000-4000-8000-000000000010',
 'c5100000-0000-4000-8000-000000000020'),null::jsonb,'reconnect invalidates the earlier connection');
update public.chat_call_invites set status='canceled',ended_at=clock_timestamp()
 where id='c5100000-0000-4000-8000-000000000005';
select is(public.whole_app_read_ios_call_state_observer(
 'c5100000-0000-4000-8000-000000000007',repeat('a',64),'c5100000-0000-4000-8000-000000000011',
 'c5100000-0000-4000-8000-000000000020')->>'status','canceled','current canceled state is visible without mutating the invite');
update auth.sessions set not_after=clock_timestamp()-interval '1 second'
 where id='c5100000-0000-4000-8000-000000000003';
select is(public.whole_app_read_ios_call_state_observer(
 'c5100000-0000-4000-8000-000000000007',repeat('a',64),'c5100000-0000-4000-8000-000000000011',
 'c5100000-0000-4000-8000-000000000020'),null::jsonb,'expired exact auth session retires a live connection');
update auth.sessions set not_after=null where id='c5100000-0000-4000-8000-000000000003';
select is(public.whole_app_revoke_ios_voip_push_ownership(
 'c5100000-0000-4000-8000-000000000002','c5100000-0000-4000-8000-000000000002',
 'c5100000-0000-4000-8000-000000000003','observer-pgtap-install','all',repeat('8',64),
 'observer-pgtap-revoke','sign_out')->>'disposition','revoked','actual revocation clears exact delivery authority');
select is(public.whole_app_read_ios_call_state_observer(
 'c5100000-0000-4000-8000-000000000007',repeat('a',64),'c5100000-0000-4000-8000-000000000011',
 'c5100000-0000-4000-8000-000000000020'),null::jsonb,'token revocation immediately retires read authority');
select is((select status from public.chat_call_invites where id='c5100000-0000-4000-8000-000000000005'),
 'canceled','observer operations never rewrite call status');
select * from finish();
rollback;
