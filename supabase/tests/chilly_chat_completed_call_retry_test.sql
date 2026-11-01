begin;
select plan(12);

insert into auth.users(id,is_sso_user,is_anonymous) values
 ('dc110000-0000-4000-8000-000000000001',false,false),
 ('dc110000-0000-4000-8000-000000000002',false,false);
insert into auth.sessions(id,user_id) values
 ('dc112000-0000-4000-8000-000000000001','dc110000-0000-4000-8000-000000000001');
select set_config('request.jwt.claims',
 '{"role":"authenticated","sub":"dc110000-0000-4000-8000-000000000001","session_id":"dc112000-0000-4000-8000-000000000001"}',true);
insert into public.chat_threads(id,thread_kind,participant_pair_key,created_by) values
 ('dc111000-0000-4000-8000-000000000001','direct',
 'dc110000-0000-4000-8000-000000000001::dc110000-0000-4000-8000-000000000002','dc110000-0000-4000-8000-000000000001');
insert into public.chat_thread_members(thread_id,user_id) values
 ('dc111000-0000-4000-8000-000000000001','dc110000-0000-4000-8000-000000000001'),
 ('dc111000-0000-4000-8000-000000000001','dc110000-0000-4000-8000-000000000002');
create temporary table completed_retry_fixture(label text primary key,invite_id uuid);

do $$
declare v_invite uuid;
begin
 for n in 1..3 loop
  insert into public.communication_rooms(room_id,room_code,host_user_id,status) values
   ('PGRETRY'||n,'PGRETRY'||n,'dc110000-0000-4000-8000-000000000001','active');
  v_invite := (public.begin_chilly_chat_call('dc111000-0000-4000-8000-000000000001','PGRETRY'||n,'video')->'invite'->>'id')::uuid;
  if n<3 then
   perform public.transition_chilly_chat_call_invite(v_invite,'dc110000-0000-4000-8000-000000000002','declined',null);
  else insert into completed_retry_fixture values('completed',v_invite);
  end if;
 end loop;
end $$;

select throws_ok(format('select public.transition_chilly_chat_call_invite(%L,%L,%L,null)',
 (select invite_id from completed_retry_fixture where label='completed'),'dc110000-0000-4000-8000-000000000001','accepted'),
 'P0001','transition_accept_forbidden','caller cannot manufacture callee consent');
select public.transition_chilly_chat_call_invite((select invite_id from completed_retry_fixture where label='completed'),
 'dc110000-0000-4000-8000-000000000002','accepted',null);
select public.transition_chilly_chat_call_invite((select invite_id from completed_retry_fixture where label='completed'),
 'dc110000-0000-4000-8000-000000000001','ended',null);
select is((select count(*)::integer from public.abuse_rate_limit_events where actor_user_id='dc110000-0000-4000-8000-000000000001' and action_key='chat_call_invite'),3,'completion retains all rate history');
insert into public.communication_rooms(room_id,room_code,host_user_id,status) values
 ('PGRETRY4','PGRETRY4','dc110000-0000-4000-8000-000000000001','active');
select lives_ok($$insert into completed_retry_fixture select 'retry',(public.begin_chilly_chat_call('dc111000-0000-4000-8000-000000000001','PGRETRY4','video')->'invite'->>'id')::uuid$$,
 'callee-accepted ended call permits a new invitation');
select is((select count(*)::integer from public.abuse_rate_limit_events where actor_user_id='dc110000-0000-4000-8000-000000000001' and action_key='chat_call_invite'),4,'retry adds exactly one ledger entry');
select public.transition_chilly_chat_call_invite((select invite_id from completed_retry_fixture where label='retry'),
 'dc110000-0000-4000-8000-000000000001','canceled',null);
insert into public.communication_rooms(room_id,room_code,host_user_id,status) values
 ('PGRETRY5','PGRETRY5','dc110000-0000-4000-8000-000000000001','active');
select throws_ok($$select public.begin_chilly_chat_call('dc111000-0000-4000-8000-000000000001','PGRETRY5','video')$$,
 'P0001','rate_limited','caller cancellation still counts against unanswered budget');
select ok(not has_table_privilege('authenticated','public.chat_call_invites','INSERT'),'clients cannot forge invite admission');
select ok(not has_table_privilege('authenticated','public.chat_call_invites','UPDATE'),'clients cannot forge completed state');
select ok(not has_table_privilege('authenticated','public.chat_call_transition_deliveries','INSERT'),'clients cannot forge receipt');
select ok(not has_table_privilege('authenticated','public.abuse_rate_limit_events','UPDATE'),'clients cannot rewrite ledger');
select ok(not has_function_privilege('authenticated','public.transition_chilly_chat_call_invite(uuid,uuid,text,integer)','EXECUTE'),'server transition RPC cannot impersonate another actor');
select is((select status from public.communication_rooms where room_id='PGRETRY3'),'ended','real terminal transition closed completed room');
select is((select count(*)::integer from public.abuse_rate_limit_events where actor_user_id='dc110000-0000-4000-8000-000000000001' and action_key='communication_room_create' and metadata ? 'room_id'),5,'all new allocations have server-written exact identity');
select * from finish();
rollback;
