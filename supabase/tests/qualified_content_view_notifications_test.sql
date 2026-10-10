begin;
select no_plan();
insert into auth.users(id,is_sso_user,is_anonymous) values
 ('9a130000-0000-4000-8000-000000000001',false,false),
 ('9a130000-0000-4000-8000-000000000002',false,false),
 ('9a130000-0000-4000-8000-000000000003',false,false);
update auth.users set email_confirmed_at=now(),aud='authenticated',role='authenticated'
 where id::text like '9a130000-%';
insert into auth.sessions(id,user_id) values
 ('9a130000-0000-4000-8000-000000000011','9a130000-0000-4000-8000-000000000001'),
 ('9a130000-0000-4000-8000-000000000012','9a130000-0000-4000-8000-000000000002'),
 ('9a130000-0000-4000-8000-000000000013','9a130000-0000-4000-8000-000000000003');
insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,
 role_key,capability,session_generation,authority_source)
 select s.user_id,public.wave1_sha256(s.user_id::text),d.document_key,d.version,d.market,'member',d.capability,
 s.id::text,'service_reconciliation' from auth.sessions s cross join public.wave1_legal_document_versions d
 where s.user_id::text like '9a130000-%' and d.active and d.market='UNITED_STATES' and d.capability='account';
insert into public.videos(id,owner_id,title,visibility,moderation_status,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes)
 values('9a130000-0000-4000-8000-000000000021','9a130000-0000-4000-8000-000000000001','View fixture','public','clean',
 'cloudflare_r2','chillywood-media-origin','9a130000-0000-4000-8000-000000000001/9a130000-0000-4000-8000-000000000021/source.mp4',
 '9a130000-0000-4000-8000-000000000001/9a130000-0000-4000-8000-000000000021/source.mp4','video/mp4',1024);
update public.videos set scan_status='clean',scan_provider='pgtap',scan_result='clean',scanned_at=now()
 where id='9a130000-0000-4000-8000-000000000021';

select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid in
 ('public.notification_video_view_sessions'::regclass,'public.notification_qualified_views'::regclass)),'viewer identities are in private RLS tables');
select ok(not has_table_privilege('authenticated','public.notification_qualified_views','SELECT'),'creators cannot read viewer identities');
select ok(not has_function_privilege('authenticated','private.record_qualified_notification_view(text,text,uuid,uuid)','EXECUTE'),'clients cannot choose a creator recipient');
select ok(not has_function_privilege('anon','public.begin_video_notification_view(uuid)','EXECUTE'),'anonymous views do not create user notifications');

set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9a130000-0000-4000-8000-000000000001","session_id":"9a130000-0000-4000-8000-000000000011"}',true);
select is(public.begin_video_notification_view('9a130000-0000-4000-8000-000000000021'),null::uuid,'creator watching own video does not count');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9a130000-0000-4000-8000-000000000002","session_id":"9a130000-0000-4000-8000-000000000012"}',true);
select isnt(public.begin_video_notification_view('9a130000-0000-4000-8000-000000000021'),null::uuid,'eligible exact authenticated viewer starts duration boundary');
reset role;
create temporary table view_test_ids as select id from public.notification_video_view_sessions
 where viewer_user_id='9a130000-0000-4000-8000-000000000002';
grant select on view_test_ids to authenticated;
select is((select count(*)::int from view_test_ids),1,'one exact view session exists');
set local role authenticated;
select ok(not public.complete_content_notification_view((select id from view_test_ids)),'mere opening cannot complete before ten seconds');
reset role;
select is((select count(*)::int from public.notification_qualified_views),0,'no completion means no count');
update public.notification_video_view_sessions set started_at=now()-interval '11 seconds' where id=(select id from view_test_ids);
set local role authenticated;
select ok(public.complete_content_notification_view((select id from view_test_ids)),'sustained exact viewer qualifies after server duration');
select ok(public.complete_content_notification_view((select id from view_test_ids)),'repeated completion is harmless');
select is(public.begin_video_notification_view('9a130000-0000-4000-8000-000000000021'),(select id from view_test_ids),'reopening reuses same viewer/video/day');
reset role;
select is((select count(*)::int from public.notification_qualified_views),1,'reconnect and report replay count once');
select is((select count(*)::int from public.notification_activity_events where event_kind in ('video_view_summary','live_view_summary')),1,'one daily summary per creator and kind');
select is((select count(*)::int from public.notifications where source_type='notification_activity' and notification_type in ('video_view_summary','live_view_summary')),0,'view does not create an immediate individual bell alert');
select is((select count(*)::int from public.claim_notification_activity_batch(100) j
 where exists(select 1 from public.notification_activity_events e where e.id=(j->>'eventId')::uuid
   and e.event_kind in ('video_view_summary','live_view_summary'))),0,'daily summary waits for complete UTC day');
select ok((select scheduled_at=((now() at time zone 'UTC')::date+1)::timestamp at time zone 'UTC' from public.notification_activity_events where event_kind in ('video_view_summary','live_view_summary')),'daily schedule has explicit UTC boundary');

set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9a130000-0000-4000-8000-000000000003","session_id":"9a130000-0000-4000-8000-000000000013"}',true);
select ok(not public.complete_content_notification_view((select id from view_test_ids)),'another account cannot complete first viewer session');
select is(public.begin_video_notification_view('00000000-0000-4000-8000-000000000000'),null::uuid,'missing video fails closed');
reset role;
update public.videos set vip_access_required=true where id='9a130000-0000-4000-8000-000000000021';
set local role authenticated;
select is(public.begin_video_notification_view('9a130000-0000-4000-8000-000000000021'),null::uuid,'VIP without exact pass cannot begin');
reset role;
update public.videos set vip_access_required=false where id='9a130000-0000-4000-8000-000000000021';
update public.notification_qualified_views set view_day=(now() at time zone 'UTC')::date-1;
update public.notification_activity_events set source_id=((now() at time zone 'UTC')::date-1)::text,
 context=jsonb_build_object('viewDay',(now() at time zone 'UTC')::date-1,'viewKind','video'),scheduled_at=now()-interval '1 second' where event_kind='video_view_summary';
create temporary table summary_claims as select (j->>'eventId')::uuid id,(j->>'leaseToken')::uuid lease
 from public.claim_notification_activity_batch(100) j where exists(select 1 from public.notification_activity_events e
   where e.id=(j->>'eventId')::uuid and e.event_kind in ('video_view_summary','live_view_summary'));
select is((select private.resolve_notification_activity(e)->>'push_allowed' from public.notification_activity_events e where event_kind in ('video_view_summary','live_view_summary')),'false','view summary push defaults off');
select is((select public.prepare_notification_activity(id,lease)->>'eligible' from summary_claims),'true','completed day materializes grouped view summary');
select is((select count(*)::int from public.notifications where source_type='notification_activity' and notification_type in ('video_view_summary','live_view_summary')),1,'one grouped bell alert is saved');
select is((select target_context->>'viewerCount' from public.notifications where source_type='notification_activity' and notification_type in ('video_view_summary','live_view_summary')),'1','summary reports distinct authenticated viewers');
select ok((select not (target_context ? 'viewerUserId') from public.notifications where source_type='notification_activity' and notification_type in ('video_view_summary','live_view_summary')),'summary does not identify viewers');
insert into public.notification_preferences(user_id,view_summary_push_enabled) values('9a130000-0000-4000-8000-000000000001',true);
select is((select private.resolve_notification_activity(e)->>'push_allowed' from public.notification_activity_events e where event_kind in ('video_view_summary','live_view_summary')),'true','creator may explicitly opt into summary phone alerts');
update public.notification_preferences set view_summary_enabled=false where user_id='9a130000-0000-4000-8000-000000000001';
select is((select private.resolve_notification_activity(e)->>'eligible' from public.notification_activity_events e where event_kind in ('video_view_summary','live_view_summary')),'false','view category opt-out suppresses delivery');
update public.notification_preferences set view_summary_enabled=true where user_id='9a130000-0000-4000-8000-000000000001';
update public.videos set moderation_status='removed' where id='9a130000-0000-4000-8000-000000000021';
select is((select private.resolve_notification_activity(e)->>'eligible' from public.notification_activity_events e where event_kind in ('video_view_summary','live_view_summary')),'false','removed source cannot leak into delayed summary');

-- Actual HLS records and their independently mutable current broadcast.
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into public.watch_party_rooms(party_id,host_user_id,room_type,is_active,join_policy,content_access_rule)
 values('NOTIFY-LIVE-VIEW','9a130000-0000-4000-8000-000000000001','live',true,'open','open');
insert into public.room_broadcast_sessions(id,source_type,source_room_id,host_user_id,channel_user_id,broadcast_status,
 egress_status,hls_playback_url,playback_url_status,rights_status,access_type,is_publicly_watchable,is_spectator_playback_enabled,
 requires_premium,requires_ticket,metadata) values
 ('9a130000-0000-4000-8000-000000000031','watch_party_room','NOTIFY-LIVE-VIEW',
 '9a130000-0000-4000-8000-000000000001','9a130000-0000-4000-8000-000000000001','active_later',
 'active_later','https://example.invalid/notification-view.m3u8','public_safe_available','creator_owned','public_free',true,true,
 false,false,'{"d7f_public_safe_approved":true}');
insert into public.spectator_hls_playback_records(id,broadcast_session_id,source_room_id,host_user_id,channel_user_id,
 visibility,playback_status,playlist_path,rights_status,access_type,is_publicly_watchable,is_spectator_playback_enabled,
 requires_premium,requires_ticket) values
 ('9a130000-0000-4000-8000-000000000032','9a130000-0000-4000-8000-000000000031','NOTIFY-LIVE-VIEW',
 '9a130000-0000-4000-8000-000000000001','9a130000-0000-4000-8000-000000000001',
 'public','live','notification-view/index.m3u8','creator_owned','public_free',true,true,false,false);
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9a130000-0000-4000-8000-000000000002","session_id":"9a130000-0000-4000-8000-000000000012"}',true);
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9a130000-0000-4000-8000-000000000002","session_id":"9a130000-0000-4000-8000-000000000012"}',true);
select isnt(public.begin_spectator_notification_view('9a130000-0000-4000-8000-000000000032'),null::uuid,
 'current public HLS broadcast permits exact authenticated viewer qualification');
reset role;
create temporary table hls_view_id as select id from public.notification_video_view_sessions
 where spectator_record_id='9a130000-0000-4000-8000-000000000032';
grant select on hls_view_id to authenticated;
update public.notification_video_view_sessions set started_at=now()-interval '11 seconds' where id=(select id from hls_view_id);
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9a130000-0000-4000-8000-000000000002","session_id":"9a130000-0000-4000-8000-000000000012"}',true);
select ok(public.complete_content_notification_view((select id from hls_view_id)), 'actual HLS duration completion qualifies once');
select ok(public.complete_content_notification_view((select id from hls_view_id)), 'actual HLS completion replay is idempotent');
reset role;
select is((select count(*)::int from public.notification_qualified_views where view_kind='live'),1,'HLS replay has one qualified viewer');

-- Every case restores its real source rows; no policy/function replacements.
select set_config('request.jwt.claims','{"role":"service_role"}',true);

update public.room_broadcast_sessions set broadcast_status='ended' where id='9a130000-0000-4000-8000-000000000031';
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9a130000-0000-4000-8000-000000000002","session_id":"9a130000-0000-4000-8000-000000000012"}',true);
select is(public.begin_spectator_notification_view('9a130000-0000-4000-8000-000000000032'),null::uuid,'stale live record cannot borrow an ended broadcast');
select ok(not public.complete_content_notification_view((select id from hls_view_id)),'ended broadcast also rejects previously issued completion');
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.room_broadcast_sessions set broadcast_status='active_later',egress_status='active_later',ended_at=null
 where id='9a130000-0000-4000-8000-000000000031';
update public.spectator_hls_playback_records set host_user_id='9a130000-0000-4000-8000-000000000001',
 channel_user_id='9a130000-0000-4000-8000-000000000001',source_room_id='NOTIFY-LIVE-VIEW'
 where id='9a130000-0000-4000-8000-000000000032';
update public.watch_party_rooms set host_user_id='9a130000-0000-4000-8000-000000000001',is_active=true where party_id='NOTIFY-LIVE-VIEW';
update auth.sessions set not_after=null where id='9a130000-0000-4000-8000-000000000012';

update public.room_broadcast_sessions set egress_status='stopped_later' where id='9a130000-0000-4000-8000-000000000031';
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9a130000-0000-4000-8000-000000000002","session_id":"9a130000-0000-4000-8000-000000000012"}',true);
select is(public.begin_spectator_notification_view('9a130000-0000-4000-8000-000000000032'),null::uuid,'stopped egress overrides stale active broadcast');
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.room_broadcast_sessions set broadcast_status='active_later',egress_status='active_later',ended_at=null
 where id='9a130000-0000-4000-8000-000000000031';
update public.spectator_hls_playback_records set host_user_id='9a130000-0000-4000-8000-000000000001',
 channel_user_id='9a130000-0000-4000-8000-000000000001',source_room_id='NOTIFY-LIVE-VIEW'
 where id='9a130000-0000-4000-8000-000000000032';
update public.watch_party_rooms set host_user_id='9a130000-0000-4000-8000-000000000001',is_active=true where party_id='NOTIFY-LIVE-VIEW';
update auth.sessions set not_after=null where id='9a130000-0000-4000-8000-000000000012';

update public.room_broadcast_sessions set ended_at=now() where id='9a130000-0000-4000-8000-000000000031';
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9a130000-0000-4000-8000-000000000002","session_id":"9a130000-0000-4000-8000-000000000012"}',true);
select is(public.begin_spectator_notification_view('9a130000-0000-4000-8000-000000000032'),null::uuid,'ended timestamp cannot retain live view qualification');
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.room_broadcast_sessions set broadcast_status='active_later',egress_status='active_later',ended_at=null
 where id='9a130000-0000-4000-8000-000000000031';
update public.spectator_hls_playback_records set host_user_id='9a130000-0000-4000-8000-000000000001',
 channel_user_id='9a130000-0000-4000-8000-000000000001',source_room_id='NOTIFY-LIVE-VIEW'
 where id='9a130000-0000-4000-8000-000000000032';
update public.watch_party_rooms set host_user_id='9a130000-0000-4000-8000-000000000001',is_active=true where party_id='NOTIFY-LIVE-VIEW';
update auth.sessions set not_after=null where id='9a130000-0000-4000-8000-000000000012';

update public.spectator_hls_playback_records set host_user_id='9a130000-0000-4000-8000-000000000003' where id='9a130000-0000-4000-8000-000000000032';
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9a130000-0000-4000-8000-000000000002","session_id":"9a130000-0000-4000-8000-000000000012"}',true);
select is(public.begin_spectator_notification_view('9a130000-0000-4000-8000-000000000032'),null::uuid,'record cannot borrow another broadcast host');
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.room_broadcast_sessions set broadcast_status='active_later',egress_status='active_later',ended_at=null
 where id='9a130000-0000-4000-8000-000000000031';
update public.spectator_hls_playback_records set host_user_id='9a130000-0000-4000-8000-000000000001',
 channel_user_id='9a130000-0000-4000-8000-000000000001',source_room_id='NOTIFY-LIVE-VIEW'
 where id='9a130000-0000-4000-8000-000000000032';
update public.watch_party_rooms set host_user_id='9a130000-0000-4000-8000-000000000001',is_active=true where party_id='NOTIFY-LIVE-VIEW';
update auth.sessions set not_after=null where id='9a130000-0000-4000-8000-000000000012';

update public.spectator_hls_playback_records set channel_user_id='9a130000-0000-4000-8000-000000000003' where id='9a130000-0000-4000-8000-000000000032';
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9a130000-0000-4000-8000-000000000002","session_id":"9a130000-0000-4000-8000-000000000012"}',true);
select is(public.begin_spectator_notification_view('9a130000-0000-4000-8000-000000000032'),null::uuid,'record cannot invent another creator channel');
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.room_broadcast_sessions set broadcast_status='active_later',egress_status='active_later',ended_at=null
 where id='9a130000-0000-4000-8000-000000000031';
update public.spectator_hls_playback_records set host_user_id='9a130000-0000-4000-8000-000000000001',
 channel_user_id='9a130000-0000-4000-8000-000000000001',source_room_id='NOTIFY-LIVE-VIEW'
 where id='9a130000-0000-4000-8000-000000000032';
update public.watch_party_rooms set host_user_id='9a130000-0000-4000-8000-000000000001',is_active=true where party_id='NOTIFY-LIVE-VIEW';
update auth.sessions set not_after=null where id='9a130000-0000-4000-8000-000000000012';

update public.spectator_hls_playback_records set source_room_id='NOTIFY-OTHER-ROOM' where id='9a130000-0000-4000-8000-000000000032';
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9a130000-0000-4000-8000-000000000002","session_id":"9a130000-0000-4000-8000-000000000012"}',true);
select is(public.begin_spectator_notification_view('9a130000-0000-4000-8000-000000000032'),null::uuid,'record must belong to the same actual broadcast source');
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.room_broadcast_sessions set broadcast_status='active_later',egress_status='active_later',ended_at=null
 where id='9a130000-0000-4000-8000-000000000031';
update public.spectator_hls_playback_records set host_user_id='9a130000-0000-4000-8000-000000000001',
 channel_user_id='9a130000-0000-4000-8000-000000000001',source_room_id='NOTIFY-LIVE-VIEW'
 where id='9a130000-0000-4000-8000-000000000032';
update public.watch_party_rooms set host_user_id='9a130000-0000-4000-8000-000000000001',is_active=true where party_id='NOTIFY-LIVE-VIEW';
update auth.sessions set not_after=null where id='9a130000-0000-4000-8000-000000000012';

update public.watch_party_rooms set host_user_id='9a130000-0000-4000-8000-000000000003' where party_id='NOTIFY-LIVE-VIEW';
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9a130000-0000-4000-8000-000000000002","session_id":"9a130000-0000-4000-8000-000000000012"}',true);
select is(public.begin_spectator_notification_view('9a130000-0000-4000-8000-000000000032'),null::uuid,'changed current room owner invalidates older broadcast ownership');
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.room_broadcast_sessions set broadcast_status='active_later',egress_status='active_later',ended_at=null
 where id='9a130000-0000-4000-8000-000000000031';
update public.spectator_hls_playback_records set host_user_id='9a130000-0000-4000-8000-000000000001',
 channel_user_id='9a130000-0000-4000-8000-000000000001',source_room_id='NOTIFY-LIVE-VIEW'
 where id='9a130000-0000-4000-8000-000000000032';
update public.watch_party_rooms set host_user_id='9a130000-0000-4000-8000-000000000001',is_active=true where party_id='NOTIFY-LIVE-VIEW';
update auth.sessions set not_after=null where id='9a130000-0000-4000-8000-000000000012';

update public.watch_party_rooms set is_active=false where party_id='NOTIFY-LIVE-VIEW';
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9a130000-0000-4000-8000-000000000002","session_id":"9a130000-0000-4000-8000-000000000012"}',true);
select is(public.begin_spectator_notification_view('9a130000-0000-4000-8000-000000000032'),null::uuid,'inactive source room cannot retain a stale live record');
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.room_broadcast_sessions set broadcast_status='active_later',egress_status='active_later',ended_at=null
 where id='9a130000-0000-4000-8000-000000000031';
update public.spectator_hls_playback_records set host_user_id='9a130000-0000-4000-8000-000000000001',
 channel_user_id='9a130000-0000-4000-8000-000000000001',source_room_id='NOTIFY-LIVE-VIEW'
 where id='9a130000-0000-4000-8000-000000000032';
update public.watch_party_rooms set host_user_id='9a130000-0000-4000-8000-000000000001',is_active=true where party_id='NOTIFY-LIVE-VIEW';
update auth.sessions set not_after=null where id='9a130000-0000-4000-8000-000000000012';

update auth.sessions set not_after=now()-interval '1 second' where id='9a130000-0000-4000-8000-000000000012';
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9a130000-0000-4000-8000-000000000002","session_id":"9a130000-0000-4000-8000-000000000012"}',true);
select is(public.begin_spectator_notification_view('9a130000-0000-4000-8000-000000000032'),null::uuid,'retained expired auth session cannot begin HLS view');
select ok(not public.complete_content_notification_view((select id from hls_view_id)),'retained expired auth session cannot complete HLS view');
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.room_broadcast_sessions set broadcast_status='active_later',egress_status='active_later',ended_at=null
 where id='9a130000-0000-4000-8000-000000000031';
update public.spectator_hls_playback_records set host_user_id='9a130000-0000-4000-8000-000000000001',
 channel_user_id='9a130000-0000-4000-8000-000000000001',source_room_id='NOTIFY-LIVE-VIEW'
 where id='9a130000-0000-4000-8000-000000000032';
update public.watch_party_rooms set host_user_id='9a130000-0000-4000-8000-000000000001',is_active=true where party_id='NOTIFY-LIVE-VIEW';
update auth.sessions set not_after=null where id='9a130000-0000-4000-8000-000000000012';

set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9a130000-0000-4000-8000-000000000002","session_id":"9a130000-0000-4000-8000-000000000012"}',true);
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9a130000-0000-4000-8000-000000000002","session_id":"9a130000-0000-4000-8000-000000000013"}',true);
select is(public.begin_spectator_notification_view('9a130000-0000-4000-8000-000000000032'),null::uuid,'other-account session ID is not current authority');
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.room_broadcast_sessions set broadcast_status='active_later',egress_status='active_later',ended_at=null
 where id='9a130000-0000-4000-8000-000000000031';
update public.spectator_hls_playback_records set host_user_id='9a130000-0000-4000-8000-000000000001',
 channel_user_id='9a130000-0000-4000-8000-000000000001',source_room_id='NOTIFY-LIVE-VIEW'
 where id='9a130000-0000-4000-8000-000000000032';
update public.watch_party_rooms set host_user_id='9a130000-0000-4000-8000-000000000001',is_active=true where party_id='NOTIFY-LIVE-VIEW';
update auth.sessions set not_after=null where id='9a130000-0000-4000-8000-000000000012';

set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9a130000-0000-4000-8000-000000000002","session_id":"9a130000-0000-4000-8000-000000000012"}',true);
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9a130000-0000-4000-8000-000000000001","session_id":"9a130000-0000-4000-8000-000000000011"}',true);
select is(public.begin_spectator_notification_view('9a130000-0000-4000-8000-000000000032'),null::uuid,'own HLS stream never creates own-view notifications');
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.room_broadcast_sessions set broadcast_status='active_later',egress_status='active_later',ended_at=null
 where id='9a130000-0000-4000-8000-000000000031';
update public.spectator_hls_playback_records set host_user_id='9a130000-0000-4000-8000-000000000001',
 channel_user_id='9a130000-0000-4000-8000-000000000001',source_room_id='NOTIFY-LIVE-VIEW'
 where id='9a130000-0000-4000-8000-000000000032';
update public.watch_party_rooms set host_user_id='9a130000-0000-4000-8000-000000000001',is_active=true where party_id='NOTIFY-LIVE-VIEW';
update auth.sessions set not_after=null where id='9a130000-0000-4000-8000-000000000012';


-- LiveKit qualification comes from the actual membership heartbeat procedure.
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9a130000-0000-4000-8000-000000000002","session_id":"9a130000-0000-4000-8000-000000000012"}',true);
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9a130000-0000-4000-8000-000000000002","session_id":"9a130000-0000-4000-8000-000000000012"}',true);
select lives_ok($$select public.join_watch_party_room_session('NOTIFY-LIVE-VIEW','Viewer',null,null,false,false,false)$$,
 'actual authorized viewer admission succeeds');
reset role;
select is((select count(*)::int from public.notification_qualified_views where source_id='NOTIFY-LIVE-VIEW'),0,'mere membership admission does not qualify');
-- The immutable joined_at is established on fixture insertion, never rewritten.
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
delete from public.watch_party_room_memberships where party_id='NOTIFY-LIVE-VIEW' and user_id='9a130000-0000-4000-8000-000000000002';
insert into public.watch_party_room_memberships(party_id,user_id,role,stage_role,membership_state,joined_at,last_seen_at,mic_enabled,camera_enabled) values
 ('NOTIFY-LIVE-VIEW','9a130000-0000-4000-8000-000000000002','viewer','listener','active',now()-interval '11 seconds',now()-interval '2 seconds',false,false);
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9a130000-0000-4000-8000-000000000002","session_id":"9a130000-0000-4000-8000-000000000012"}',true);
select lives_ok($$select public.heartbeat_watch_party_room_session('NOTIFY-LIVE-VIEW','active',false,false)$$,
 'actual admitted live viewer heartbeat qualifies with unchanged media permissions');
reset role;
select is((select count(*)::int from public.notification_qualified_views where source_id='NOTIFY-LIVE-VIEW'),1,'one actual sustained active heartbeat records live viewer');
select ok((select not mic_enabled and not camera_enabled and stage_role='listener' from public.watch_party_room_memberships
 where party_id='NOTIFY-LIVE-VIEW' and user_id='9a130000-0000-4000-8000-000000000002'),'notification qualification never grants publishing authority');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
delete from public.notification_qualified_views where source_id='NOTIFY-LIVE-VIEW';
update public.watch_party_room_memberships set last_seen_at=now()-interval '60 seconds'
 where party_id='NOTIFY-LIVE-VIEW' and user_id='9a130000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9a130000-0000-4000-8000-000000000002","session_id":"9a130000-0000-4000-8000-000000000012"}',true);
select public.heartbeat_watch_party_room_session('NOTIFY-LIVE-VIEW','active',false,false);
reset role;
select is((select count(*)::int from public.notification_qualified_views where source_id='NOTIFY-LIVE-VIEW'),0,'long-disconnected membership does not masquerade as sustained viewing');
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);

delete from public.notification_qualified_views where source_id='NOTIFY-LIVE-VIEW';
update public.watch_party_room_memberships set last_seen_at=now()-interval '2 seconds'
 where party_id='NOTIFY-LIVE-VIEW' and user_id='9a130000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9a130000-0000-4000-8000-000000000002","session_id":"9a130000-0000-4000-8000-000000000012"}',true);
select public.heartbeat_watch_party_room_session('NOTIFY-LIVE-VIEW','reconnecting',false,false);
reset role;
select is((select count(*)::int from public.notification_qualified_views where source_id='NOTIFY-LIVE-VIEW'),0,'reconnecting heartbeat does not qualify');
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);



-- An abandoned short view may be retried later in the same authenticated day.
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.videos set moderation_status='clean' where id='9a130000-0000-4000-8000-000000000021';
update public.notification_video_view_sessions set started_at=now()-interval '3 hours',completed_at=null where id=(select id from view_test_ids);
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9a130000-0000-4000-8000-000000000002","session_id":"9a130000-0000-4000-8000-000000000012"}',true);
select is(public.begin_video_notification_view('9a130000-0000-4000-8000-000000000021'),(select id from view_test_ids),'expired abandoned view reuses its bounded daily row');
reset role;
select ok((select started_at>=now()-interval '1 second' from public.notification_video_view_sessions where id=(select id from view_test_ids)),
 'abandoned expired view starts a fresh qualification duration instead of remaining permanently expired');


set local role authenticated;
select ok(not public.complete_content_notification_view((select id from view_test_ids)),'fresh video retry cannot immediately complete');
reset role;
update public.notification_video_view_sessions set started_at=now()-interval '11 seconds' where id=(select id from view_test_ids);
set local role authenticated;
select ok(public.complete_content_notification_view((select id from view_test_ids)),'video retry qualifies only after its fresh duration');
reset role;
update public.notification_video_view_sessions set started_at=now()-interval '3 hours',completed_at=null where id=(select id from hls_view_id);
set local role authenticated;
select is(public.begin_spectator_notification_view('9a130000-0000-4000-8000-000000000032'),(select id from hls_view_id),'expired HLS retry reuses bounded daily row');
select ok(not public.complete_content_notification_view((select id from hls_view_id)),'fresh HLS retry cannot immediately complete');
reset role;
select ok((select started_at>=now()-interval '1 second' from public.notification_video_view_sessions where id=(select id from hls_view_id)),
 'abandoned HLS retry resets its duration');
update public.notification_video_view_sessions set started_at=now()-interval '11 seconds' where id=(select id from hls_view_id);
set local role authenticated;
select ok(public.complete_content_notification_view((select id from hls_view_id)),'HLS retry qualifies only after fresh duration');
reset role;
select is((select count(*)::int from public.notification_qualified_views where source_id='hls:9a130000-0000-4000-8000-000000000032'),1,
 'HLS retry never duplicates already-qualified daily viewer');

select * from finish();
rollback;
