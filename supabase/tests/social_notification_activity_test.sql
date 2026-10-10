begin;
select no_plan();
set local timezone='UTC';

-- All source mutations use the real schema, guards and proposed AFTER triggers.
-- Fake identities, source rows, notifications and privileges roll back together.
insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at) values
 ('9b330000-0000-4000-8000-000000000001',false,false,now()),
 ('9b330000-0000-4000-8000-000000000002',false,false,now()),
 ('9b330000-0000-4000-8000-000000000003',false,false,now()),
 ('9b330000-0000-4000-8000-000000000004',false,false,now());
update public.user_profiles set profile_access_visibility='public',shares_visibility='public'
 where user_id like '9b330000-%';
create function pg_temp.social_plan(p_kind text,p_recipient text default null) returns jsonb language sql as $$
 select private.resolve_social_notification_activity(event)
 from public.notification_activity_events event where event.event_kind=p_kind
   and event.actor_user_id::text like '9b330000-%'
   and (p_recipient is null or event.recipient_user_id::text=p_recipient)
 order by event.created_at,event.id limit 1
$$;
create function pg_temp.social_drain() returns integer language plpgsql as $$
declare claim jsonb; result jsonb; n integer:=0;
begin
 for claim in select public.claim_notification_activity_batch(10) loop
   result:=public.prepare_notification_activity((claim->>'eventId')::uuid,(claim->>'leaseToken')::uuid);
   perform public.finish_notification_activity((claim->>'eventId')::uuid,(claim->>'leaseToken')::uuid);
   n:=n+1;
 end loop;
 return n;
end $$;
select ok(not has_function_privilege('authenticated','private.enqueue_notification_activity(text,text,text,uuid,uuid,jsonb,timestamptz,timestamptz)','execute'),
 'client cannot enqueue arbitrary recipients');
select ok(not has_function_privilege('authenticated','private.resolve_social_notification_activity(public.notification_activity_events)','execute'),
 'recipient resolver is not a client enumeration API');
select ok(not has_table_privilege('authenticated','public.notification_activity_events','insert'),
 'client cannot forge the durable event');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.notification_activity_events'::regclass),
 'private event table retains forced RLS');

insert into public.channel_followers(channel_user_id,follower_user_id) values
 ('9b330000-0000-4000-8000-000000000002','9b330000-0000-4000-8000-000000000001');
select is((select recipient_user_id::text from public.notification_activity_events where event_kind='social_follow' and actor_user_id='9b330000-0000-4000-8000-000000000001'),
 '9b330000-0000-4000-8000-000000000002','follower insert derives the exact channel owner');
select is(pg_temp.social_plan('social_follow')->>'eligible','true','real follow source resolves');
update public.channel_followers set updated_at=now() where follower_user_id='9b330000-0000-4000-8000-000000000001';
select is((select count(*)::integer from public.notification_activity_events where event_kind='social_follow' and actor_user_id='9b330000-0000-4000-8000-000000000001'),1,'follow metadata edits do not duplicate');
select pg_temp.social_drain();
select is((select count(*)::integer from public.notifications where notification_type='social_follow' and user_id='9b330000-0000-4000-8000-000000000002'),1,
 'actual common materializer creates one exact recipient bell row');
select is((select deep_link from public.notifications where notification_type='social_follow' and user_id='9b330000-0000-4000-8000-000000000002'),
 '/profile/9b330000-0000-4000-8000-000000000001','follow route contains the actual actor only');
delete from public.channel_followers where follower_user_id='9b330000-0000-4000-8000-000000000001';
select is(pg_temp.social_plan('social_follow')->>'eligible','false','removed source suppresses stale follow');
insert into public.channel_followers(channel_user_id,follower_user_id) values
 ('9b330000-0000-4000-8000-000000000002','9b330000-0000-4000-8000-000000000001');
select is((select count(*)::integer from public.notification_activity_events where event_kind='social_follow' and actor_user_id='9b330000-0000-4000-8000-000000000001'),1,'refollow cannot spam the same relationship event');

insert into public.channel_audience_requests(channel_user_id,requester_user_id) values
 ('9b330000-0000-4000-8000-000000000002','9b330000-0000-4000-8000-000000000003');
select is(pg_temp.social_plan('social_follow_request')->>'eligible','true','persisted pending follow request resolves');
update public.channel_audience_requests set status='approved',reviewed_by=channel_user_id,reviewed_at=now()
 where requester_user_id='9b330000-0000-4000-8000-000000000003';
select is(pg_temp.social_plan('social_follow_accepted')->>'eligible','false','approval label alone does not imply actual following');
insert into public.channel_followers(channel_user_id,follower_user_id) values
 ('9b330000-0000-4000-8000-000000000002','9b330000-0000-4000-8000-000000000003');
select is(pg_temp.social_plan('social_follow_accepted')->>'eligible','true','approval plus exact follower resolves to requester');
select is(pg_temp.social_plan('social_follow_request')->>'eligible','false','already reviewed request alert is stale');

insert into public.user_friendships(user_low_id,user_high_id,requested_by_user_id,status) values
 ('9b330000-0000-4000-8000-000000000001','9b330000-0000-4000-8000-000000000002','9b330000-0000-4000-8000-000000000001','pending');
select is(pg_temp.social_plan('circle_request')->>'eligible','true','pending Circle relationship notifies its recipient');
update public.user_friendships set status='active',responded_at=now(),actioned_by_user_id=user_high_id
 where user_low_id='9b330000-0000-4000-8000-000000000001' and user_high_id='9b330000-0000-4000-8000-000000000002';
select is(pg_temp.social_plan('circle_accepted')->>'eligible','true','recipient acceptance notifies the original requester');
select is(pg_temp.social_plan('circle_request')->>'eligible','false','accepted Circle request no longer presents as pending');
insert into public.user_friendships(user_low_id,user_high_id,requested_by_user_id,status,responded_at,actioned_by_user_id) values
 ('9b330000-0000-4000-8000-000000000001','9b330000-0000-4000-8000-000000000003','9b330000-0000-4000-8000-000000000001','active',now(),'9b330000-0000-4000-8000-000000000001');
select is(pg_temp.social_plan('circle_added')->>'eligible','true','public add gets its own truthful event');
select is((select count(*)::integer from public.notification_activity_events where event_kind='circle_accepted' and source_id like '%000000000003'),0,'public add does not manufacture acceptance');

insert into public.titles(id,title,is_published,status) values
 ('9b331000-0000-4000-8000-000000000001','Social test title',true,'published');
insert into public.user_content_relationships(user_id,title_id,relationship_type) values
 ('9b330000-0000-4000-8000-000000000001','9b331000-0000-4000-8000-000000000001','share'),
 ('9b330000-0000-4000-8000-000000000001','9b331000-0000-4000-8000-000000000001','like');
select is((select count(*)::integer from public.notification_activity_events where event_kind='content_shared' and actor_user_id='9b330000-0000-4000-8000-000000000001'),2,'stored share fans out only to then-active Circle friends');
select is((select count(*)::integer from public.notification_activity_events where event_kind='content_liked' and actor_user_id='9b330000-0000-4000-8000-000000000001'),0,'ownerless catalog like does not invent a creator recipient');
select is(pg_temp.social_plan('content_shared')->>'eligible','true','public disclosed share resolves');
select is(pg_temp.social_plan('content_shared')->>'target_route','/title/[id]','stored share opens the actual shared title, not a profile without a share feed');
select is(pg_temp.social_plan('content_shared')->>'target_entity_id','9b331000-0000-4000-8000-000000000001','share destination is the exact published title');
update public.user_profiles set shares_visibility='private' where user_id='9b330000-0000-4000-8000-000000000001';
select is(pg_temp.social_plan('content_shared')->>'eligible','false','share disclosure is rechecked at delivery');
update public.user_profiles set shares_visibility='public' where user_id='9b330000-0000-4000-8000-000000000001';
update public.user_friendships set status='removed' where user_high_id='9b330000-0000-4000-8000-000000000003';
select is(pg_temp.social_plan('content_shared','9b330000-0000-4000-8000-000000000003')->>'eligible','false','removed Circle friend cannot receive queued share');

insert into public.profile_posts(id,user_id,body) values
 ('9b332000-0000-4000-8000-000000000001','9b330000-0000-4000-8000-000000000001','fixture post with private text');
select is((select count(*)::integer from public.notification_activity_events where event_kind='circle_post' and source_id='9b332000-0000-4000-8000-000000000001'),1,'new post goes only to current active Circle members');
select is(pg_temp.social_plan('circle_post')->>'eligible','true','Circle post delivery checks current visibility');
update public.profile_posts set body='edited fixture' where id='9b332000-0000-4000-8000-000000000001';
select is((select count(*)::integer from public.notification_activity_events where event_kind='circle_post' and source_id='9b332000-0000-4000-8000-000000000001'),1,'ordinary post edit produces no second alert');
insert into public.profile_post_likes(post_id,user_id) values
 ('9b332000-0000-4000-8000-000000000001','9b330000-0000-4000-8000-000000000002'),
 ('9b332000-0000-4000-8000-000000000001','9b330000-0000-4000-8000-000000000001');
select is(pg_temp.social_plan('profile_post_liked')->>'eligible','true','post like notifies its real owner');
select is((select count(*)::integer from public.notification_activity_events where event_kind='profile_post_liked' and source_id='9b332000-0000-4000-8000-000000000001'),1,'self like never notifies');

insert into public.profile_post_comments(id,post_id,user_id,body) values
 ('9b333000-0000-4000-8000-000000000001','9b332000-0000-4000-8000-000000000001','9b330000-0000-4000-8000-000000000002','parent private fixture');
insert into public.profile_post_comments(id,post_id,user_id,body,parent_comment_id) values
 ('9b333000-0000-4000-8000-000000000002','9b332000-0000-4000-8000-000000000001','9b330000-0000-4000-8000-000000000003','reply private fixture','9b333000-0000-4000-8000-000000000001');
select is((select count(*)::integer from public.notification_activity_events where source_id='9b333000-0000-4000-8000-000000000002'),2,'reply derives distinct owner and parent-author recipients');
select is(pg_temp.social_plan('profile_reply')->>'eligible','true','exact visible parent reply resolves');
select ok(pg_temp.social_plan('profile_reply')->>'body' not like '%private fixture%','ordinary alert does not disclose comment text');
update public.profile_post_comments set deleted_at=now() where id='9b333000-0000-4000-8000-000000000001';
select is(pg_temp.social_plan('profile_reply')->>'eligible','false','deleted parent suppresses queued reply');
update public.profile_post_comments set deleted_at=null where id='9b333000-0000-4000-8000-000000000001';
update public.user_profiles set profile_access_visibility='subscriber_only' where user_id='9b330000-0000-4000-8000-000000000001';
select is(pg_temp.social_plan('profile_reply')->>'eligible','false','recipient without current profile access receives no private reply');
select is(pg_temp.social_plan('profile_comment')->>'eligible','true','content owner retains their own comment notification');
update public.user_profiles set profile_access_visibility='public' where user_id='9b330000-0000-4000-8000-000000000001';

insert into public.channel_audience_blocks(channel_user_id,blocked_user_id,blocked_by_user_id) values
 ('9b330000-0000-4000-8000-000000000003','9b330000-0000-4000-8000-000000000002','9b330000-0000-4000-8000-000000000003');
select is(pg_temp.social_plan('profile_reply')->>'eligible','false','actor-to-recipient block stops delivery');
delete from public.channel_audience_blocks where channel_user_id='9b330000-0000-4000-8000-000000000003';
insert into public.channel_audience_blocks(channel_user_id,blocked_user_id,blocked_by_user_id) values
 ('9b330000-0000-4000-8000-000000000002','9b330000-0000-4000-8000-000000000003','9b330000-0000-4000-8000-000000000002');
select is(pg_temp.social_plan('profile_reply')->>'eligible','false','recipient-to-actor block stops delivery');
delete from public.channel_audience_blocks where channel_user_id='9b330000-0000-4000-8000-000000000002';

insert into auth.sessions(id,user_id) values
 ('9b330000-0000-4000-8000-000000000101','9b330000-0000-4000-8000-000000000001');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9b330000-0000-4000-8000-000000000001","session_id":"9b330000-0000-4000-8000-000000000101"}',true);
insert into public.chat_threads(id,participant_pair_key,created_by) values
 ('9b334000-0000-4000-8000-000000000001','9b330000-0000-4000-8000-000000000001::9b330000-0000-4000-8000-000000000002','9b330000-0000-4000-8000-000000000001');
insert into public.chat_thread_members(thread_id,user_id) values
 ('9b334000-0000-4000-8000-000000000001','9b330000-0000-4000-8000-000000000001'),
 ('9b334000-0000-4000-8000-000000000001','9b330000-0000-4000-8000-000000000002');
set local role authenticated;
insert into public.chat_messages(id,thread_id,sender_user_id,body) values
 ('9b335000-0000-4000-8000-000000000001','9b334000-0000-4000-8000-000000000001','9b330000-0000-4000-8000-000000000001','private message fixture');
select throws_ok($$insert into public.chat_messages(thread_id,sender_user_id,body) values
 ('9b334000-0000-4000-8000-000000000001','9b330000-0000-4000-8000-000000000004','forged sender')$$,
 '42501',null,'message alert does not weaken exact sender RLS');
reset role;
select is(pg_temp.social_plan('chat_message')->>'eligible','true','actual unread message resolves to the other member');
select is((select unread_count from public.chat_thread_members where thread_id='9b334000-0000-4000-8000-000000000001' and user_id='9b330000-0000-4000-8000-000000000002'),1,'existing chat unread counter still advances');
select is(pg_temp.social_plan('chat_message')->>'body','You have a new message.','message content stays off ordinary push');
update public.chat_thread_members set last_read_at=now() where thread_id='9b334000-0000-4000-8000-000000000001' and user_id='9b330000-0000-4000-8000-000000000002';
select is(pg_temp.social_plan('chat_message')->>'eligible','false','read before delivery suppresses message alert');
update public.chat_thread_members set last_read_at=null where thread_id='9b334000-0000-4000-8000-000000000001' and user_id='9b330000-0000-4000-8000-000000000002';
update public.chat_messages set moderation_status='hidden' where id='9b335000-0000-4000-8000-000000000001';
select is(pg_temp.social_plan('chat_message')->>'eligible','false','hidden message does not notify');
update public.chat_messages set moderation_status='clean' where id='9b335000-0000-4000-8000-000000000001';

insert into public.notification_preferences(user_id,messages_enabled,circle_activity_enabled,in_app_enabled,push_enabled)
 values('9b330000-0000-4000-8000-000000000002',false,false,true,false);
select is((select private.resolve_notification_activity(event)->>'eligible' from public.notification_activity_events event where event_kind='chat_message' and source_id='9b335000-0000-4000-8000-000000000001'),'false','category preference suppresses message before materialization');
select pg_temp.social_drain();
select pg_temp.social_drain();
select is((select count(*)::integer from public.notifications where notification_type='chat_message' and user_id='9b330000-0000-4000-8000-000000000002'),0,'disabled message creates no bell row');
select is((select count(*)::integer from public.notifications where notification_type='circle_post' and user_id='9b330000-0000-4000-8000-000000000002'),0,'disabled Circle creates no bell row');

select is((select private.resolve_social_notification_activity(jsonb_populate_record(null::public.notification_activity_events,
 to_jsonb(event)||jsonb_build_object('recipient_user_id','9b330000-0000-4000-8000-000000000004')))->>'eligible'
 from public.notification_activity_events event where event_kind='profile_post_liked' and source_id='9b332000-0000-4000-8000-000000000001'),
 'false','tampered recipient cannot reuse another owner like');
select is((select private.resolve_social_notification_activity(jsonb_populate_record(null::public.notification_activity_events,
 to_jsonb(event)||jsonb_build_object('actor_user_id','9b330000-0000-4000-8000-000000000004')))->>'eligible'
 from public.notification_activity_events event where event_kind='chat_message' and source_id='9b335000-0000-4000-8000-000000000001'),
 'false','tampered sender cannot reuse another message');

insert into public.videos(id,owner_id,title,visibility,moderation_status,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes)
 values('9b336000-0000-4000-8000-000000000001','9b330000-0000-4000-8000-000000000001','Social video fixture','public','clean','cloudflare_r2','chillywood-media-origin',
 '9b330000-0000-4000-8000-000000000001/social-source.mp4','9b330000-0000-4000-8000-000000000001/social-source.mp4','video/mp4',1024);
update public.videos set scan_status='clean',scan_provider='pgtap',scan_result='clean',scanned_at=now()
 where id='9b336000-0000-4000-8000-000000000001';
insert into public.creator_video_comments(id,video_id,user_id,body) values
 ('9b337000-0000-4000-8000-000000000001','9b336000-0000-4000-8000-000000000001','9b330000-0000-4000-8000-000000000002','video parent fixture');
insert into public.creator_video_comments(id,video_id,user_id,body,parent_comment_id) values
 ('9b337000-0000-4000-8000-000000000002','9b336000-0000-4000-8000-000000000001','9b330000-0000-4000-8000-000000000003','video reply fixture','9b337000-0000-4000-8000-000000000001');
select is(pg_temp.social_plan('video_reply')->>'eligible','true','actual public video reply resolves to its parent author');
select is(pg_temp.social_plan('video_reply')->>'target_entity_id','9b336000-0000-4000-8000-000000000001','video route is exact source without invented focus parameters');
select is((select count(*)::integer from public.notification_activity_events where source_id='9b337000-0000-4000-8000-000000000002'),2,'video reply notifies unique content owner and parent author');
update public.videos set visibility='draft' where id='9b336000-0000-4000-8000-000000000001';
select is(pg_temp.social_plan('video_reply')->>'eligible','false','newly private video suppresses parent-author delivery');
update public.videos set visibility='circle' where id='9b336000-0000-4000-8000-000000000001';
select is(pg_temp.social_plan('video_reply')->>'eligible','true','current exact Circle member can receive Circle video reply');
update public.user_friendships set status='removed' where user_low_id='9b330000-0000-4000-8000-000000000001' and user_high_id='9b330000-0000-4000-8000-000000000002';
select is(pg_temp.social_plan('video_reply')->>'eligible','false','removed Circle member cannot receive protected video activity');
update public.videos set visibility='public',vip_access_required=true where id='9b336000-0000-4000-8000-000000000001';
select is(pg_temp.social_plan('video_reply')->>'eligible','false','VIP classification without exact pass cannot leak reply activity');
select is(pg_temp.social_plan('video_comment')->>'eligible','true','video owner still receives their own content activity');
update public.videos set moderation_status='hidden' where id='9b336000-0000-4000-8000-000000000001';
select is(pg_temp.social_plan('video_comment')->>'eligible','false','moderation-hidden video suppresses even owner activity');
update auth.users set banned_until=now()+interval '1 hour' where id='9b330000-0000-4000-8000-000000000003';
select is(pg_temp.social_plan('profile_reply')->>'eligible','false','restricted actor suppresses queued activity');
update auth.users set banned_until=null where id='9b330000-0000-4000-8000-000000000003';
create temporary table social_deleted_account_event as select * from public.notification_activity_events
 where event_kind='profile_reply' and source_id='9b333000-0000-4000-8000-000000000002';
select set_config('request.jwt.claims','{}',true);
delete from auth.users where id='9b330000-0000-4000-8000-000000000003';
select is((select private.resolve_social_notification_activity(jsonb_populate_record(null::public.notification_activity_events,to_jsonb(event)))->>'eligible'
 from social_deleted_account_event event),'false','deleted actor cannot use a previously captured event');

savepoint rollback_source;
insert into public.channel_followers(channel_user_id,follower_user_id) values
 ('9b330000-0000-4000-8000-000000000002','9b330000-0000-4000-8000-000000000004');
rollback to rollback_source;
select is((select count(*)::integer from public.notification_activity_events where actor_user_id='9b330000-0000-4000-8000-000000000004'),0,'rolled-back source creates no durable event');
select * from finish();
rollback;
