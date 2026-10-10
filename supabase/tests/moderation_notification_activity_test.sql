begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,aud,role,is_sso_user,is_anonymous) values
 ('9a140000-0000-4000-8000-000000000001','mod-operator@example.test',now(),'authenticated','authenticated',false,false),
 ('9a140000-0000-4000-8000-000000000002','mod-owner@example.test',now(),'authenticated','authenticated',false,false),
 ('9a140000-0000-4000-8000-000000000003','mod-reporter@example.test',now(),'authenticated','authenticated',false,false);
insert into auth.sessions(id,user_id) values
 ('9a140000-0000-4000-8000-000000000011','9a140000-0000-4000-8000-000000000001'),
 ('9a140000-0000-4000-8000-000000000012','9a140000-0000-4000-8000-000000000002');
insert into public.platform_role_memberships(role,user_id,email,status,notes,granted_by)
 values('owner','9a140000-0000-4000-8000-000000000001','mod-operator@example.test','active','Rollback notification fixture','pgtap');
insert into public.platform_first_owner_authority(owner_membership_id,owner_user_id,owner_email,established_by,established_reason)
 select id,user_id,email,'pgtap','Rollback notification fixture' from public.platform_role_memberships
 where user_id='9a140000-0000-4000-8000-000000000001';
insert into public.user_profiles(user_id,username) values ('9a140000-0000-4000-8000-000000000002','mod_owner_fixture') on conflict do nothing;
insert into public.profile_posts(id,user_id,body) values
 ('9a140000-0000-4000-8000-000000000021','9a140000-0000-4000-8000-000000000002','Private fixture body');
insert into public.profile_post_comments(id,post_id,user_id,body) values
 ('9a140000-0000-4000-8000-000000000022','9a140000-0000-4000-8000-000000000021','9a140000-0000-4000-8000-000000000002','Private fixture comment');
insert into public.videos(id,owner_id,title,visibility,moderation_status,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes)
 values('9a140000-0000-4000-8000-000000000023','9a140000-0000-4000-8000-000000000002','Private video name','public','clean',
 'cloudflare_r2','chillywood-media-origin','9a140000-0000-4000-8000-000000000002/9a140000-0000-4000-8000-000000000023/source.mp4',
 '9a140000-0000-4000-8000-000000000002/9a140000-0000-4000-8000-000000000023/source.mp4','video/mp4',1024);
insert into public.creator_video_comments(id,video_id,user_id,body) values
 ('9a140000-0000-4000-8000-000000000024','9a140000-0000-4000-8000-000000000023','9a140000-0000-4000-8000-000000000002','Private video comment');
insert into public.social_attachments(id,owner_user_id,surface_type,surface_id,storage_path,mime_type)
 values('9a140000-0000-4000-8000-000000000025','9a140000-0000-4000-8000-000000000002','profile_post',
 '9a140000-0000-4000-8000-000000000021','9a140000-0000-4000-8000-000000000002/fixture.jpg','image/jpeg');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9a140000-0000-4000-8000-000000000002","session_id":"9a140000-0000-4000-8000-000000000012"}',true);
insert into public.chat_threads(id,participant_pair_key,created_by) values
 ('9a140000-0000-4000-8000-000000000026','9a140000-0000-4000-8000-000000000002::9a140000-0000-4000-8000-000000000003','9a140000-0000-4000-8000-000000000002');
insert into public.chat_thread_members(thread_id,user_id) values
 ('9a140000-0000-4000-8000-000000000026','9a140000-0000-4000-8000-000000000002'),
 ('9a140000-0000-4000-8000-000000000026','9a140000-0000-4000-8000-000000000003');
set local role authenticated;
insert into public.chat_messages(id,thread_id,sender_user_id,body) values
 ('9a140000-0000-4000-8000-000000000027','9a140000-0000-4000-8000-000000000026','9a140000-0000-4000-8000-000000000002','Private chat content');
reset role;
insert into public.safety_reports(id,reporter_user_id,target_type,target_id,category,context) values
 (914001,'9a140000-0000-4000-8000-000000000003','profile_post','9a140000-0000-4000-8000-000000000021','other','{}'),
 (914002,'9a140000-0000-4000-8000-000000000003','profile_post_comment','9a140000-0000-4000-8000-000000000022','other','{}'),
 (914003,'9a140000-0000-4000-8000-000000000003','creator_video','9a140000-0000-4000-8000-000000000023','other','{}'),
 (914004,'9a140000-0000-4000-8000-000000000003','creator_video_comment','9a140000-0000-4000-8000-000000000024','other','{}'),
 (914005,'9a140000-0000-4000-8000-000000000003','social_attachment','9a140000-0000-4000-8000-000000000025','other','{}'),
 (914006,'9a140000-0000-4000-8000-000000000003','profile_media','9a140000-0000-4000-8000-000000000002','other','{"profileMediaKind":"avatar"}'),
 (914007,'9a140000-0000-4000-8000-000000000003','chat_message','9a140000-0000-4000-8000-000000000027','other','{"threadId":"9a140000-0000-4000-8000-000000000026"}');
select is((select count(*)::int from public.notification_activity_events where event_kind='moderation_notice'),0,'a report alone does not notify or disclose a reporter');
select ok(not has_function_privilege('authenticated','private.notification_moderation_target(public.safety_reports)','EXECUTE'),'clients cannot inspect moderation targets');
select ok(not has_function_privilege('authenticated','private.enqueue_moderation_notification_activity()','EXECUTE'),'clients cannot invoke moderation producer');
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9a140000-0000-4000-8000-000000000002","session_id":"9a140000-0000-4000-8000-000000000012","email":"mod-owner@example.test"}',true);
select throws_ok($$select public.apply_admin_report_target_action(914001,'profile_post','9a140000-0000-4000-8000-000000000021','hide','private staff reason')$$,
 'P0001',null,'ordinary content owner cannot forge moderation action');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9a140000-0000-4000-8000-000000000001","session_id":"9a140000-0000-4000-8000-000000000011","email":"mod-operator@example.test"}',true);
select lives_ok($$select public.apply_admin_report_target_action(914001,'profile_post','9a140000-0000-4000-8000-000000000021','hide','private staff reason')$$,'actual operator hides post');
select lives_ok($$select public.apply_admin_report_target_action(914002,'profile_post_comment','9a140000-0000-4000-8000-000000000022','hide','private staff reason')$$,'actual operator hides post comment');
select lives_ok($$select public.apply_admin_report_target_action(914003,'creator_video','9a140000-0000-4000-8000-000000000023','hide','private staff reason')$$,'actual operator hides video');
select lives_ok($$select public.apply_admin_report_target_action(914004,'creator_video_comment','9a140000-0000-4000-8000-000000000024','remove','private staff reason')$$,'actual operator removes video comment');
select lives_ok($$select public.apply_admin_report_target_action(914005,'social_attachment','9a140000-0000-4000-8000-000000000025','hide','private staff reason')$$,'actual operator hides attachment');
select throws_ok($$select public.apply_admin_report_target_action(914006,'profile_media','9a140000-0000-4000-8000-000000000002','hide','private staff reason')$$,
 '42501','profile_media_status_server_owned','existing profile-media enforcement blocks operator action; no guard widening or end-to-end success claim');
select lives_ok($$select public.apply_admin_report_target_action(914007,'chat_message','9a140000-0000-4000-8000-000000000027','hide','private staff reason')$$,'actual operator hides exact reported chat message');
reset role;
select is((select count(*)::int from public.notification_activity_events where event_kind='moderation_notice'),6,'six supported actual decisions enqueue six events; blocked avatar creates none');
select ok((select bool_and(recipient_user_id='9a140000-0000-4000-8000-000000000002'::uuid and actor_user_id is null) from public.notification_activity_events where event_kind='moderation_notice'),'only exact owner receives decision; staff identity omitted');
select ok((select bool_and((private.resolve_notification_activity(e)->>'eligible')::boolean) from public.notification_activity_events e where e.event_kind='moderation_notice'),'all six supported current decisions resolve');
savepoint profile_observer_fixture;
-- Typed observer-only proof: this is explicitly a synthetic server-authored
-- restored decision. It does not bypass or execute the blocked operator path.
update public.user_profiles set profile_media_updated_at=now() where user_id='9a140000-0000-4000-8000-000000000002';
update public.safety_reports set status='actioned',resolution_type='target_restored',resolved_at=now(),
 resolved_by='9a140000-0000-4000-8000-000000000001' where id=914006;
select is((select private.resolve_notification_activity(e)->>'deep_link' from public.notification_activity_events e where e.event_kind='moderation_notice' and source_id='914006'),
 '/profile/9a140000-0000-4000-8000-000000000002','synthetic current restored profile decision supports observer-only exact-owner route');
rollback to profile_observer_fixture;
select ok((select bool_and(private.resolve_notification_activity(e)::text not like '%private staff%' and private.resolve_notification_activity(e)::text not like '%000000000003%') from public.notification_activity_events e where e.event_kind='moderation_notice'),'payload excludes staff notes and reporter identity');
select is((select private.resolve_notification_activity(e)->>'target_route' from public.notification_activity_events e where e.event_kind='moderation_notice' and source_id='914003'),'/channel-studio','video review opens owner studio');
select is((select private.resolve_notification_activity(e)->>'deep_link' from public.notification_activity_events e where e.event_kind='moderation_notice' and source_id='914007'),
 '/chat/9a140000-0000-4000-8000-000000000026','chat moderation opens only exact existing member thread without exposing message contents');
savepoint stale_target;
update public.profile_posts set moderated_at=moderated_at+interval '1 second' where id='9a140000-0000-4000-8000-000000000021';
select is((select private.resolve_notification_activity(e)->>'eligible' from public.notification_activity_events e where e.event_kind='moderation_notice' and source_id='914001'),'false',
 'later target decision time suppresses old same-status report');
rollback to stale_target;
savepoint stale_target;
update public.chat_messages set moderation_report_id=null where id='9a140000-0000-4000-8000-000000000027';
select is((select private.resolve_notification_activity(e)->>'eligible' from public.notification_activity_events e where e.event_kind='moderation_notice' and source_id='914007'),'false',
 'chat source must still name exact report decision');
rollback to stale_target;
savepoint stale_target;
delete from public.chat_thread_members where thread_id='9a140000-0000-4000-8000-000000000026' and user_id='9a140000-0000-4000-8000-000000000002';
select is((select private.resolve_notification_activity(e)->>'eligible' from public.notification_activity_events e where e.event_kind='moderation_notice' and source_id='914007'),'false',
 'former chat member receives no stale thread deep link');
rollback to stale_target;
update public.safety_reports set updated_at=now() where id=914001;
select is((select count(*)::int from public.notification_activity_events where event_kind='moderation_notice'),6,'unrelated report updates do not duplicate');
insert into public.notification_preferences(user_id,account_activity_enabled) values('9a140000-0000-4000-8000-000000000002',false);
select ok((select bool_and(not (private.resolve_notification_activity(e)->>'eligible')::boolean) from public.notification_activity_events e where e.event_kind='moderation_notice'),'disabled moderation preference suppresses all decisions');
update public.notification_preferences set account_activity_enabled=true where user_id='9a140000-0000-4000-8000-000000000002';
update public.safety_reports set status='needs_review',resolution_type=null,resolved_at=null where id=914001;
select is((select private.resolve_notification_activity(e)->>'eligible' from public.notification_activity_events e where e.event_kind='moderation_notice' and source_id='914001'),'false','reopened decision suppresses stale alert');
set local role authenticated;
select lives_ok($$select public.apply_admin_report_target_action(914001,'profile_post','9a140000-0000-4000-8000-000000000021','restore','private restored reason')$$,'actual operator restores reviewed post');
reset role;
select is((select count(*)::int from public.notification_activity_events where event_kind='moderation_notice' and source_id='914001'),2,'restoration is its own decision');
select is((select private.resolve_notification_activity(e)->>'body' from public.notification_activity_events e where e.event_kind='moderation_notice' and source_id='914001' and context->>'resolution'='target_restored'),
 'Your content was restored after review.','restoration has accurate safe copy');
select is((select private.resolve_notification_activity(e)->>'eligible' from public.notification_activity_events e where e.event_kind='moderation_notice' and source_id='914001' and context->>'resolution'='target_hidden'),'false','restoration suppresses old hidden notice');
create temporary table moderation_claims as select (j->>'eventId')::uuid id,(j->>'leaseToken')::uuid lease from public.claim_notification_activity_batch(10) j
  join public.notification_activity_events e on e.id=(j->>'eventId')::uuid and e.event_kind='moderation_notice';
select public.prepare_notification_activity(id,lease) from moderation_claims;
select is((select count(*)::int from public.notifications where source_type='notification_activity' and category='moderation_notice'),6,'current supported decisions produce one bell record each');
select ok((select bool_and(target_context::text not like '%private%' and body not like '%Private%') from public.notifications where source_type='notification_activity' and category='moderation_notice'),'bell contains no private source body');
select * from finish();

rollback;
