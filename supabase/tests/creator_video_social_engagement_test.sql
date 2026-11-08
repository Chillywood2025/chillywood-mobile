begin;
select no_plan();
select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid in
 ('video_engagement_private.likes'::regclass,'video_engagement_private.reposts'::regclass,
  'video_engagement_private.counts'::regclass,'video_engagement_private.write_limits'::regclass)),
 'All private engagement tables force row security');
select ok(not has_schema_privilege('authenticated','video_engagement_private','usage'),'Reaction identities are not an exposed API');
select ok(not has_table_privilege('authenticated','video_engagement_private.counts','update'),'Clients cannot write totals');
select ok(not has_function_privilege('authenticated','video_engagement_private.withdraw_reposts(uuid)','execute'),'Clients cannot withdraw another user activity');
select ok(not has_function_privilege('anon','public.set_creator_video_like(uuid,boolean)','execute'),'Anonymous cannot like');
select ok(not has_function_privilege('anon','public.set_creator_video_repost(uuid,boolean)','execute'),'Anonymous cannot repost');
select ok(not has_function_privilege('service_role','public.set_creator_video_repost(uuid,boolean)','execute'),'No service impersonation repost entry point');
select ok((select not prosecdef from pg_proc where oid='public.read_creator_video_engagement_batch(uuid[])'::regprocedure),'Batch preserves invoker source RLS');
set local role anon;
select is((select count(*)::integer from public.read_creator_video_engagement_batch('{}'::uuid[])),0,'Empty requested batch is empty');
select throws_ok($$select * from public.read_creator_video_engagement_batch(array_fill('11111111-1111-4111-8111-111111111111'::uuid,array[51]))$$,
 '22023','Too many videos.','Oversized batch is rejected, not truncated');
select throws_ok($$select public.read_creator_video_reposts('11111111-1111-4111-8111-111111111111',now(),null,24)$$,
 '22023','Invalid repost page.','Partial cursor rejected');
reset role;
select * from finish();
rollback;
