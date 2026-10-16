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
-- Make both sessions legally current so ordinary-versus-staff assertions test
-- role authority rather than missing account acceptance. Keep real guards.
insert into public.wave1_legal_acceptances(
 user_id,subject_hash,document_key,document_version,market,
 role_key,capability,session_generation,authority_source
)
select fixture_session.user_id,public.wave1_sha256(fixture_session.user_id::text),
 document.document_key,document.version,document.market,
 coalesce(nullif(lower(trim(profile.channel_role)),''),'member'),
 document.capability,fixture_session.id::text,'service_reconciliation'
from auth.sessions fixture_session
left join public.user_profiles profile on profile.user_id=fixture_session.user_id::text
cross join public.wave1_legal_document_versions document
where fixture_session.id in (
 '9a140000-0000-4000-8000-000000000011','9a140000-0000-4000-8000-000000000012'
)
 and document.active and document.market='UNITED_STATES'
 and document.capability='account';
insert into public.platform_role_memberships(role,user_id,email,status,notes,granted_by)
 values('owner','9a140000-0000-4000-8000-000000000001','mod-operator@example.test','active','Rollback notification fixture','pgtap');
insert into public.platform_first_owner_authority(owner_membership_id,owner_user_id,owner_email,established_by,established_reason)
 select id,user_id,email,'pgtap','Rollback notification fixture' from public.platform_role_memberships
 where user_id='9a140000-0000-4000-8000-000000000001';
insert into public.user_profiles(user_id,username) values ('9a140000-0000-4000-8000-000000000002','mod_owner_fixture') on conflict do nothing;
insert into storage.objects(id,bucket_id,name,owner,owner_id,metadata) values
 ('9a140000-0000-4000-8000-000000000031','profile-media','9a140000-0000-4000-8000-000000000002/avatar/moderation.jpg',
  '9a140000-0000-4000-8000-000000000002','9a140000-0000-4000-8000-000000000002','{"mimetype":"image/jpeg","size":1024}'),
 ('9a140000-0000-4000-8000-000000000032','profile-media','9a140000-0000-4000-8000-000000000002/background/moderation.jpg',
  '9a140000-0000-4000-8000-000000000002','9a140000-0000-4000-8000-000000000002','{"mimetype":"image/jpeg","size":1024}');
update public.user_profiles set profile_visibility='everyone',
 avatar_url=public.profile_media_public_url(user_id,user_id||'/avatar/moderation.jpg'),
 profile_background_url=public.profile_media_public_url(user_id,user_id||'/background/moderation.jpg')
 where user_id='9a140000-0000-4000-8000-000000000002';
update public.user_profiles set profile_avatar_scan_status='clean',profile_background_scan_status='clean'
 where user_id='9a140000-0000-4000-8000-000000000002';
create temporary table preserved_profile_media as select avatar_url,profile_background_url,
 profile_avatar_scan_status,profile_background_scan_status from public.user_profiles
 where user_id='9a140000-0000-4000-8000-000000000002';
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
select throws_ok($$select public.apply_admin_report_target_action(914006,'profile_media','9a140000-0000-4000-8000-000000000002','hide','private staff reason')$$,
 'P0001','admin_reports_target_permission_denied','ordinary owner cannot execute profile enforcement RPC');
select set_config('app.profile_media_report_action',jsonb_build_object('reportId','914006','actor','9a140000-0000-4000-8000-000000000002',
 'target','9a140000-0000-4000-8000-000000000002','mediaKind','avatar','action','hidden','at',now())::text,true);
select throws_ok($$update public.user_profiles set profile_avatar_media_status='flagged' where user_id='9a140000-0000-4000-8000-000000000002'$$,
 '42501','profile_media_status_server_owned','client-known report and forged GUC do not authorize moderation');
select set_config('app.profile_media_report_action','',true);
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9a140000-0000-4000-8000-000000000001","session_id":"9a140000-0000-4000-8000-000000000011","email":"mod-operator@example.test"}',true);
select lives_ok($$select public.apply_admin_report_target_action(914001,'profile_post','9a140000-0000-4000-8000-000000000021','hide','private staff reason')$$,'actual operator hides post');
select lives_ok($$select public.apply_admin_report_target_action(914002,'profile_post_comment','9a140000-0000-4000-8000-000000000022','hide','private staff reason')$$,'actual operator hides post comment');
select lives_ok($$select public.apply_admin_report_target_action(914003,'creator_video','9a140000-0000-4000-8000-000000000023','hide','private staff reason')$$,'actual operator hides video');
select lives_ok($$select public.apply_admin_report_target_action(914004,'creator_video_comment','9a140000-0000-4000-8000-000000000024','remove','private staff reason')$$,'actual operator removes video comment');
select lives_ok($$select public.apply_admin_report_target_action(914005,'social_attachment','9a140000-0000-4000-8000-000000000025','hide','private staff reason')$$,'actual operator hides attachment');
select lives_ok($$select public.apply_admin_report_target_action(914006,'profile_media','9a140000-0000-4000-8000-000000000002','hide','private staff reason')$$,
 'actual scoped operator hides reported profile avatar through audited RPC');
select is(coalesce(current_setting('app.profile_media_report_action',true),''),'','successful moderation context is cleared in the same session');
select throws_ok($$select public.apply_admin_report_target_action(914006,'profile_media','9a140000-0000-4000-8000-000000000002','hide','private staff reason')$$,
 'P0001','admin_report_closed_state','exact retry cannot duplicate the closed decision');
select lives_ok($$select public.apply_admin_report_target_action(914007,'chat_message','9a140000-0000-4000-8000-000000000027','hide','private staff reason')$$,'actual operator hides exact reported chat message');
reset role;
select ok(not (select prosecdef from pg_proc where oid='public.guard_profile_media_client_authority()'::regprocedure),
 'media authority trigger remains invoker so direct client SQL cannot impersonate report RPC');
select is((select profile_avatar_media_status from public.user_profiles where user_id='9a140000-0000-4000-8000-000000000002'),
 'flagged','real profile enforcement persisted exact avatar status');
select results_eq($$select avatar_url,profile_background_url,profile_avatar_scan_status,profile_background_scan_status
 from public.user_profiles where user_id='9a140000-0000-4000-8000-000000000002'$$,
 $$select * from preserved_profile_media$$,'profile enforcement preserves both exact object identities and both scan results');
select is(public.resolve_profile_media_delivery('9a140000-0000-4000-8000-000000000002',
 '9a140000-0000-4000-8000-000000000002/avatar/moderation.jpg')->>'reason','profile_media_moderation_blocked',
 'exact previously clean hidden media URL fails closed at production delivery resolver');
select is(public.resolve_profile_media_delivery('9a140000-0000-4000-8000-000000000002',
 '9a140000-0000-4000-8000-000000000002/background/moderation.jpg')->>'allowed','true',
 'unaffected exact clean background remains deliverable');
select is((select count(*)::int from public.notification_activity_events where event_kind='moderation_notice'),7,'seven actual decisions including profile media enqueue seven events');
select ok((select bool_and(recipient_user_id='9a140000-0000-4000-8000-000000000002'::uuid and actor_user_id is null) from public.notification_activity_events where event_kind='moderation_notice'),'only exact owner receives decision; staff identity omitted');
select ok((select bool_and((private.resolve_notification_activity(e)->>'eligible')::boolean) from public.notification_activity_events e where e.event_kind='moderation_notice'),'all seven supported current decisions resolve');
select is((select private.resolve_notification_activity(e)->>'deep_link' from public.notification_activity_events e where e.event_kind='moderation_notice' and source_id='914006'),
 '/profile/9a140000-0000-4000-8000-000000000002','real profile decision supports exact-owner route');
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
select is((select count(*)::int from public.notification_activity_events where event_kind='moderation_notice'),7,'unrelated report updates do not duplicate');
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
select is((select count(*)::int from public.notifications where source_type='notification_activity' and category='moderation_notice'),7,'current supported decisions produce one bell record each');
select ok((select bool_and(target_context::text not like '%private%' and body not like '%Private%') from public.notifications where source_type='notification_activity' and category='moderation_notice'),'bell contains no private source body');
select * from finish();

rollback;
