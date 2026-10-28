begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
set local timezone = 'UTC';

create function pg_temp.feed_user(n integer) returns text language sql immutable as $$
  select '9b470000-0000-4000-8000-' || lpad(n::text, 12, '0')
$$;
create function pg_temp.feed_actor(n integer) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('role','authenticated','sub',pg_temp.feed_user(n),
    'session_id','9b472000-0000-4000-8000-'||lpad(n::text,12,'0'))::text,true);
end;
$$;
insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at)
  select pg_temp.feed_user(n)::uuid,false,false,now() from generate_series(1,65) n;
update public.user_profiles set profile_visibility='everyone',profile_access_visibility='public'
  where user_id like '9b470000-%';
insert into public.channel_followers(channel_user_id,follower_user_id)
  select pg_temp.feed_user(n),pg_temp.feed_user(1) from generate_series(2,61) n;
insert into public.user_friendships(user_low_id,user_high_id,requested_by_user_id,status,responded_at,actioned_by_user_id)
  values(pg_temp.feed_user(1),pg_temp.feed_user(2),pg_temp.feed_user(1),'active',now(),pg_temp.feed_user(2));
insert into public.profile_posts(id,user_id,body,created_at)
  select ('9b471000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,pg_temp.feed_user(n),
    'Feed cursor fixture '||n, '2026-01-01 00:00:00+00'::timestamptz from generate_series(1,64) n;
insert into public.profile_post_likes(post_id,user_id)
  values('9b471000-0000-4000-8000-000000000002',pg_temp.feed_user(62)),('9b471000-0000-4000-8000-000000000002',pg_temp.feed_user(63));
insert into public.profile_post_comments(post_id,user_id,body)
  values('9b471000-0000-4000-8000-000000000002',pg_temp.feed_user(62),'Visible count fixture'),
    ('9b471000-0000-4000-8000-000000000002',pg_temp.feed_user(63),'Another visible count fixture');
insert into public.social_attachments(id,owner_user_id,surface_type,surface_id,storage_path,mime_type,size_bytes)
  select ('9b473000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,pg_temp.feed_user(1),'profile_post',
    case when n=3 then '9b471000-0000-4000-8000-000000000003'::uuid else '9b471000-0000-4000-8000-000000000001'::uuid end,
    '9b470000-0000-4000-8000-000000000001/feed-test-'||n||'.png','image/png',100
  from generate_series(1,4) n;
update public.social_attachments set scan_status='clean' where id in ('9b473000-0000-4000-8000-000000000001','9b473000-0000-4000-8000-000000000003');
update public.social_attachments set scan_status='malware_detected' where id='9b473000-0000-4000-8000-000000000004';
insert into public.social_attachments(id,owner_user_id,surface_type,surface_id,storage_path,mime_type,size_bytes)
  select '9b473000-0000-4000-8000-000000000005',pg_temp.feed_user(62),'profile_post_comment',id,
    '9b470000-0000-4000-8000-000000000062/feed-comment.png','image/png',100
  from public.profile_post_comments where post_id='9b471000-0000-4000-8000-000000000002' and user_id=pg_temp.feed_user(62);
update public.social_attachments set scan_status='clean' where id='9b473000-0000-4000-8000-000000000005';
-- One source INSERT creates equal feed timestamps, exercising the UUID tie-break.

select ok(not (select prosecdef from pg_proc where oid='public.read_profile_relationship_feed_page(timestamptz,uuid,timestamptz,integer)'::regprocedure), 'page function is security invoker');
select ok(not has_function_privilege('anon','public.read_profile_relationship_feed_page(timestamptz,uuid,timestamptz,integer)','execute'), 'anonymous cannot invoke personalized feed');
select ok((select relrowsecurity from pg_class where oid='public.creator_feed_items'::regclass),'existing feed RLS remains enabled');
insert into auth.sessions(id,user_id,not_after)
  select ('9b472000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,pg_temp.feed_user(n)::uuid,now()+interval '1 day'
  from generate_series(1,65) n;
select pg_temp.feed_actor(1);
set local role authenticated;
select is((select like_count from public.read_profile_post_engagement_batch(array['9b471000-0000-4000-8000-000000000002'::uuid])),2::bigint,'batch counts other users likes');
select is((select comment_count from public.read_profile_post_engagement_batch(array['9b471000-0000-4000-8000-000000000002'::uuid])),2::bigint,'batch counts other users comments');
select throws_ok($$select * from public.read_profile_relationship_feed_page(now(),null,now(),20)$$,'22023','Invalid feed cursor.','partial cursor rejected');
select throws_ok($$select * from public.read_profile_relationship_feed_page(null,null,'infinity',20)$$,'22023','Invalid feed cursor.','non-finite snapshot rejected');
select is((select count(*)::int from public.read_profile_relationship_feed_page(null,null,now(),100000)),51,'limit is capped with one lookahead');
create temporary table first_feed_page as select * from public.read_profile_relationship_feed_page(null,null,now(),20);
select is((select count(*)::int from first_feed_page),21,'one bounded page plus lookahead');
select is((select count(distinct source_id)::int from public.read_profile_relationship_feed_page(null,null,now(),50)),51,'Circle and following do not duplicate posts');
create temporary table rest_feed_page as
  select page.* from (select * from first_feed_page order by created_at desc,id desc offset 19 limit 1) cursor
  cross join lateral public.read_profile_relationship_feed_page(cursor.created_at,cursor.id,now(),50) page;
select is((select count(*)::int from rest_feed_page),41,'all sixty-one own/connected posts reachable across pages');
select is((select count(*)::int from rest_feed_page where id in (select id from first_feed_page order by created_at desc,id desc limit 20)),0,'no repeated consumed records at equal timestamp');
select is((select count(*)::int from public.read_profile_relationship_feed_page(null,null,now(),50) where creator_user_id=pg_temp.feed_user(64)),0,'outsider content never enters relationship lane');
reset role;

-- Exercise actual canonical privacy and moderation RLS, not only the RPC filter.
update public.user_profiles set profile_access_visibility='private' where user_id=pg_temp.feed_user(3);
update public.profile_posts set moderation_status='hidden' where user_id=pg_temp.feed_user(4);
update public.profile_posts set deleted_at=now() where user_id=pg_temp.feed_user(8);
insert into public.channel_audience_blocks(channel_user_id,blocked_user_id,blocked_by_user_id)
  values(pg_temp.feed_user(5),pg_temp.feed_user(1),pg_temp.feed_user(5)),(pg_temp.feed_user(1),pg_temp.feed_user(6),pg_temp.feed_user(1));
select pg_temp.feed_actor(1);
set local role authenticated;
select is((select count(*)::int from public.read_profile_relationship_feed_page(null,null,now(),50) where creator_user_id in (pg_temp.feed_user(3),pg_temp.feed_user(4),pg_temp.feed_user(5),pg_temp.feed_user(6))),0,'private, hidden and either-direction blocked content excluded');
select is((select count(*)::int from public.read_profile_post_engagement_batch(array[
  '9b471000-0000-4000-8000-000000000003'::uuid,
  '9b471000-0000-4000-8000-000000000004'::uuid,
  '9b471000-0000-4000-8000-000000000005'::uuid,
  '9b471000-0000-4000-8000-000000000006'::uuid])),0,'batch counts cannot disclose inaccessible source posts');
select throws_ok($$select * from public.read_profile_post_engagement_batch(array_fill('9b471000-0000-4000-8000-000000000001'::uuid,array[51]))$$,'22023','Too many profile posts.','batch is bounded before reading rows');
reset role;
update public.user_friendships set status='removed' where user_low_id=pg_temp.feed_user(1) and user_high_id=pg_temp.feed_user(2);
delete from public.channel_followers where channel_user_id=pg_temp.feed_user(2) and follower_user_id=pg_temp.feed_user(1);
select pg_temp.feed_actor(1);
set local role authenticated;
select is((select count(*)::int from public.read_profile_relationship_feed_page(null,null,now(),50) where creator_user_id=pg_temp.feed_user(2)),0,'relationship revocation applies immediately');
reset role;
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
select is((select count(*)::int from public.read_profile_post_engagement_batch(array['9b471000-0000-4000-8000-000000000001'::uuid])),1,'anonymous public source readable without privileged helper');
select is((select count(*)::int from public.read_profile_post_engagement_batch(array['9b471000-0000-4000-8000-000000000003'::uuid])),0,'anonymous private source stays hidden');
select is((select count(*)::int from public.social_attachments where id in ('9b473000-0000-4000-8000-000000000001','9b473000-0000-4000-8000-000000000005')),2,'anonymous scan-clean public post/comment attachments readable');
select is((select count(*)::int from public.social_attachments where id in ('9b473000-0000-4000-8000-000000000002','9b473000-0000-4000-8000-000000000003','9b473000-0000-4000-8000-000000000004')),0,'anonymous pending/private/malware attachment metadata stays hidden');
reset role;
select * from finish();
rollback;
