begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at)
values('9c470000-0000-4000-8000-000000000001',false,false,now()),
('9c470000-0000-4000-8000-000000000002',false,false,now());
update public.user_profiles set profile_visibility='everyone',profile_access_visibility='public'
where user_id like '9c470000-%';
insert into public.profile_posts(id,user_id,body)
values('9c471000-0000-4000-8000-000000000001','9c470000-0000-4000-8000-000000000001','Counter test');
insert into public.profile_post_likes(post_id,user_id)
values('9c471000-0000-4000-8000-000000000001','9c470000-0000-4000-8000-000000000002');
insert into public.profile_post_comments(id,post_id,user_id,body)
values('9c472000-0000-4000-8000-000000000001','9c471000-0000-4000-8000-000000000001','9c470000-0000-4000-8000-000000000002','Count me');
select is((select sum(like_count)::bigint from profile_engagement_private.post_counts where post_id='9c471000-0000-4000-8000-000000000001'),1::bigint,'like insert counted');
select is((select sum(comment_count)::bigint from profile_engagement_private.post_counts where post_id='9c471000-0000-4000-8000-000000000001'),1::bigint,'comment insert counted');
insert into public.profile_post_likes(post_id,user_id)
values('9c471000-0000-4000-8000-000000000001','9c470000-0000-4000-8000-000000000002') on conflict do nothing;
select is((select sum(like_count)::bigint from profile_engagement_private.post_counts where post_id='9c471000-0000-4000-8000-000000000001'),1::bigint,'duplicate insert has no delta');
update public.profile_post_comments set moderation_status='hidden' where id='9c472000-0000-4000-8000-000000000001';
select is((select sum(comment_count)::bigint from profile_engagement_private.post_counts where post_id='9c471000-0000-4000-8000-000000000001'),0::bigint,'hidden comment excluded');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='profile_engagement_private.post_counts'::regclass),'private table forces RLS');
select ok(not has_table_privilege('authenticated','profile_engagement_private.post_counts','select'),'no direct authenticated counters read');
select ok(not has_function_privilege('authenticated','profile_engagement_private.apply_delta(uuid,smallint,bigint,bigint)','execute'),'no app delta execution');
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
select is((select like_count from public.read_profile_post_engagement_batch(array['9c471000-0000-4000-8000-000000000001'::uuid])),1::bigint,'anonymous source-authorized aggregate');
reset role;
update public.profile_posts set moderation_status='hidden' where id='9c471000-0000-4000-8000-000000000001';
set local role anon;
select is((select count(*)::int from public.read_authorized_profile_post_counts('9c471000-0000-4000-8000-000000000001')),0,'direct helper cannot expose hidden post counts');
reset role;
delete from public.profile_posts where id='9c471000-0000-4000-8000-000000000001';
select is((select count(*)::int from profile_engagement_private.post_counts where post_id='9c471000-0000-4000-8000-000000000001'),0,'parent cascade removes counters without underflow');
select * from finish();
rollback;
