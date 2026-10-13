begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
set local timezone='UTC';

-- Real authenticated request/response RPCs and actual Profile-post SELECT RLS.
-- Fixtures are unrelated fake identities; every row and helper is rolled back.
create function pg_temp.admission_user(n integer) returns text language sql immutable as $$
  select '9b360000-0000-4000-8000-'||lpad(n::text,12,'0')
$$;
create function pg_temp.admission_actor(n integer) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.admission_user(n))::text,true);
end $$;
create function pg_temp.admission_events(kind text,actor integer,recipient integer) returns integer language sql as $$
  select count(*)::integer from public.notification_activity_events
  where event_kind=kind and actor_user_id=pg_temp.admission_user(actor)::uuid
    and recipient_user_id=pg_temp.admission_user(recipient)::uuid
$$;

insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at)
  select pg_temp.admission_user(n)::uuid,false,false,now() from generate_series(1,10) n;
update public.user_profiles set profile_visibility='everyone',profile_access_visibility='public'
  where user_id like '9b360000-%';
update public.user_profiles set profile_access_visibility='subscriber_only' where user_id=pg_temp.admission_user(5);
update public.user_profiles set profile_visibility='private' where user_id=pg_temp.admission_user(6);
update public.user_profiles set profile_visibility='chilly_circle_only' where user_id=pg_temp.admission_user(7);
insert into public.profile_posts(id,user_id,body) values
  ('9b361000-0000-4000-8000-000000000002',pg_temp.admission_user(2),'private admission fixture'),
  ('9b361000-0000-4000-8000-000000000005',pg_temp.admission_user(5),'subscriber admission fixture');
insert into public.user_friendships(user_low_id,user_high_id,requested_by_user_id,status,responded_at,actioned_by_user_id)
  values(pg_temp.admission_user(2),pg_temp.admission_user(8),pg_temp.admission_user(8),'active',now(),pg_temp.admission_user(8));
insert into public.channel_followers(channel_user_id,follower_user_id)
  values(pg_temp.admission_user(2),pg_temp.admission_user(1));

select ok(has_function_privilege('authenticated','public.request_friendship(text)','execute'),
  'authenticated callers retain the normal request RPC');
select ok(not has_function_privilege('anon','public.request_friendship(text)','execute'),
  'canonical migrations do not grant anonymous request execution');
select ok(has_function_privilege('service_role','public.request_friendship(text)','execute'),
  'preexisting service EXECUTE is unchanged');
select ok(has_function_privilege('authenticated','public.respond_to_friendship(text,text)','execute'),
  'recipient response uses the existing authenticated RPC');
select ok((select relrowsecurity from pg_class where oid='public.profile_posts'::regclass),
  'Profile posts retain row-level security');
select ok(not has_table_privilege('authenticated','public.notification_activity_events','insert'),
  'clients cannot invent Circle notification recipients');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.notification_activity_events'::regclass),
  'notification activity retains RLS and FORCE RLS');

-- Match Settings: update only its canonical access field, not legacy audience.
select pg_temp.admission_actor(2);
set local role authenticated;
update public.user_profiles set profile_access_visibility='private' where user_id=pg_temp.admission_user(2);
select is((select profile_access_visibility from public.user_profiles where user_id=pg_temp.admission_user(2)),
  'private','owner can choose Private through the canonical Settings field');
select is((select profile_visibility from public.user_profiles where user_id=pg_temp.admission_user(2)),
  'everyone','canonical Private does not rewrite the legacy audience');
reset role;

select pg_temp.admission_actor(8);
set local role authenticated;
select is(public.resolve_profile_visibility_access(pg_temp.admission_user(2))->>'reason',
  'circle_member_allowed','preexisting accepted member retains private Profile access');
select is((select count(*)::integer from public.profile_posts where id='9b361000-0000-4000-8000-000000000002'),
  1,'accepted member can read the private Profile post through actual RLS');
reset role;

select pg_temp.admission_actor(1);
set local role authenticated;
select is(public.resolve_profile_visibility_access(pg_temp.admission_user(2))->>'allowed',
  'false','Follow alone does not unlock the private Profile');
select is((select count(*)::integer from public.profile_posts where id='9b361000-0000-4000-8000-000000000002'),
  0,'private post is hidden before the request');
select is((public.request_friendship(pg_temp.admission_user(2))).status,
  'pending','canonical Private with legacy everyone requires recipient approval');
select is(public.resolve_profile_visibility_access(pg_temp.admission_user(2))->>'allowed',
  'false','pending requester does not receive Profile access');
select is((select count(*)::integer from public.profile_posts where id='9b361000-0000-4000-8000-000000000002'),
  0,'pending request does not unlock actual post RLS');
select is((public.request_friendship(pg_temp.admission_user(2))).status,
  'pending','repeated pending request stays pending');
select throws_ok(format('select public.respond_to_friendship(%L,%L)',pg_temp.admission_user(2),'accept'),
  'P0001','Only the recipient can accept a pending Chi''lly Circle request.',
  'requester cannot accept their own request');
reset role;
select is(pg_temp.admission_events('circle_request',1,2),1,'one request event targets the private owner');
select is(pg_temp.admission_events('circle_added',1,2),0,'private request never emits an automatic-add event');
select is((select count(*)::integer from public.user_friendships where user_low_id=pg_temp.admission_user(1)
  and user_high_id=pg_temp.admission_user(2) and status='pending' and responded_at is null and actioned_by_user_id is null),
  1,'pending relationship has no fabricated recipient decision');

select pg_temp.admission_actor(3);
set local role authenticated;
select throws_ok(format('select public.respond_to_friendship(%L,%L)',pg_temp.admission_user(2),'accept'),
  'P0001','No Chi''lly Circle request exists for this pair yet.',
  'unrelated caller cannot accept another pair through the response RPC');
select is(public.resolve_profile_visibility_access(pg_temp.admission_user(2),pg_temp.admission_user(2))->>'allowed',
  'false','forged owner argument cannot bypass the actual authenticated viewer');
select is(public.resolve_profile_visibility_access(pg_temp.admission_user(2),pg_temp.admission_user(8))->>'viewer_user_id',
  pg_temp.admission_user(3),'resolver keeps the real viewer despite an accepted-member argument');
select is((select count(*)::integer from public.profile_posts where id='9b361000-0000-4000-8000-000000000002'),
  0,'unrelated caller cannot read the private post');
reset role;

select pg_temp.admission_actor(2);
set local role authenticated;
select is((public.respond_to_friendship(pg_temp.admission_user(1),'accept')).status,
  'active','only the private owner accepts the incoming request');
reset role;
select is((select actioned_by_user_id from public.user_friendships where user_low_id=pg_temp.admission_user(1)
  and user_high_id=pg_temp.admission_user(2)),pg_temp.admission_user(2),'acceptance records the actual recipient');
select is(pg_temp.admission_events('circle_accepted',2,1),1,'one accepted event targets the original requester');
select is(pg_temp.admission_events('circle_added',1,2),0,'acceptance never becomes an automatic-add event');

select pg_temp.admission_actor(1);
set local role authenticated;
select is(public.resolve_profile_visibility_access(pg_temp.admission_user(2))->>'reason',
  'circle_member_allowed','accepted requester gains the existing Circle access reason');
select is((select count(*)::integer from public.profile_posts where id='9b361000-0000-4000-8000-000000000002'),
  1,'accepted requester can now SELECT the exact private post');
select is((public.request_friendship(pg_temp.admission_user(2))).status,
  'active','requesting an existing accepted relationship does not downgrade it');
select is((public.request_friendship(pg_temp.admission_user(4))).status,
  'active','public plus legacy everyone retains immediate Circle add');
select is((public.request_friendship(pg_temp.admission_user(5))).status,
  'active','subscriber-only retains its preexisting Circle admission behavior');
select is(public.resolve_profile_visibility_access(pg_temp.admission_user(5))->>'allowed',
  'false','Circle membership cannot unlock subscriber-only Profile access');
select is((select count(*)::integer from public.profile_posts where id='9b361000-0000-4000-8000-000000000005'),
  0,'subscriber-only actual post RLS still requires subscription');
select is((public.request_friendship(pg_temp.admission_user(6))).status,
  'pending','legacy private still requires approval with canonical public');
select is((public.request_friendship(pg_temp.admission_user(7))).status,
  'pending','legacy Circle-only still requires approval with canonical public');
select throws_ok(format('select public.request_friendship(%L)',pg_temp.admission_user(1)),
  'P0001','You cannot add yourself to Chi''lly Circle.','self request remains rejected');
select throws_ok($q$select public.request_friendship('platform_rachi_official')$q$,
  'P0001','Official platform accounts are not part of normal Chi''lly Circle adds.',
  'official account admission remains rejected');
reset role;
select is(pg_temp.admission_events('circle_added',1,4),1,'public add still produces its existing event kind');
select is((select count(*)::integer from public.channel_followers where channel_user_id like '9b360000-%'
  or follower_user_id like '9b360000-%'),1,'Circle actions leave the existing Follow intact and create no Follow');

select pg_temp.admission_actor(3);
set local role authenticated;
select is(public.resolve_profile_visibility_access(pg_temp.admission_user(2))->>'allowed',
  'false','accepting one requester does not admit another user');
select is((select count(*)::integer from public.profile_posts where id='9b361000-0000-4000-8000-000000000002'),
  0,'unrelated user still cannot SELECT the accepted pair’s private post');
reset role;

insert into public.channel_audience_blocks(channel_user_id,blocked_user_id,blocked_by_user_id) values
  (pg_temp.admission_user(9),pg_temp.admission_user(1),pg_temp.admission_user(9)),
  (pg_temp.admission_user(1),pg_temp.admission_user(10),pg_temp.admission_user(1));
select pg_temp.admission_actor(1);
set local role authenticated;
select throws_ok(format('select public.request_friendship(%L)',pg_temp.admission_user(9)),
  'P0001','Chi''lly Circle is unavailable while a channel audience block exists between these accounts.',
  'target blocking requester still prevents admission');
select throws_ok(format('select public.request_friendship(%L)',pg_temp.admission_user(10)),
  'P0001','Chi''lly Circle is unavailable while a channel audience block exists between these accounts.',
  'requester blocking target still prevents admission');
reset role;
select is((select count(*)::integer from public.user_friendships where user_low_id=pg_temp.admission_user(1)
  and user_high_id in (pg_temp.admission_user(9),pg_temp.admission_user(10))),0,
  'blocked attempts create no relationship');

select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
select throws_ok(format('select public.request_friendship(%L)',pg_temp.admission_user(2)),
  '42501','permission denied for function request_friendship','anonymous role cannot execute the canonical request RPC');
reset role;
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
set local role authenticated;
select throws_ok(format('select public.request_friendship(%L)',pg_temp.admission_user(2)),
  'P0001','Chi''lly Circle requires a signed-in user.','EXECUTE without an authenticated subject cannot create a request');
reset role;
select is(pg_temp.admission_events('circle_request',1,2),1,'rejected and repeated actions add no private request event');
select is(pg_temp.admission_events('circle_accepted',2,1),1,'acceptance remains exactly once');
select set_config('request.jwt.claims','{}',true);
select * from finish();
rollback;
