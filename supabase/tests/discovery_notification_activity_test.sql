begin;
select no_plan();
set local timezone='UTC';

-- Real local schema, production source guards and producer functions. All
-- records, proposed DDL and privilege changes are enclosed in a rollback.
-- During proposal validation only, attach the exact candidate trigger function.
do $$ declare t text; begin
  foreach t in array array['watch_party_rooms','room_broadcast_sessions','spectator_hls_playback_records',
    'videos','creator_replay_library_items','creator_events','event_reminders'] loop
    if not exists(select 1 from pg_trigger where tgrelid=('public.'||t)::regclass
      and tgname='notification_discovery_after_write') then
      execute format('create trigger notification_discovery_after_write after insert or update on public.%I '
        'for each row execute function private.enqueue_discovery_notification_transition()',t);
    end if;
  end loop;
end $$;
select is((select count(*)::integer from pg_trigger where tgname='notification_discovery_after_write'
  and tgfoid='private.enqueue_discovery_notification_transition()'::regprocedure),7,
  'all seven exact proposed triggers are attached and execute in this rollback transaction');
select is((select count(*)::integer from public.notification_activity_events),0,
 'installing producer definitions and triggers never backfills existing source rows');

insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at) values
 ('9d440000-0000-4000-8000-000000000001',false,false,now()),
 ('9d440000-0000-4000-8000-000000000002',false,false,now()),
 ('9d440000-0000-4000-8000-000000000003',false,false,now()),
 ('9d440000-0000-4000-8000-000000000004',false,false,now());
insert into public.channel_followers(channel_user_id,follower_user_id) values
 ('9d440000-0000-4000-8000-000000000001','9d440000-0000-4000-8000-000000000002'),
 ('9d440000-0000-4000-8000-000000000001','9d440000-0000-4000-8000-000000000003');
insert into public.user_friendships(user_low_id,user_high_id,requested_by_user_id,status) values
 ('9d440000-0000-4000-8000-000000000001','9d440000-0000-4000-8000-000000000003',
  '9d440000-0000-4000-8000-000000000001','active');

create function pg_temp.discovery_count(p_kind text,p_source text,p_eligible boolean default false)
returns integer language sql as $$
 select count(*)::integer from public.notification_activity_events e
 where e.event_kind=p_kind and e.source_id=p_source and e.actor_user_id='9d440000-0000-4000-8000-000000000001'
   and (not p_eligible or coalesce((private.resolve_notification_activity(e)->>'eligible')::boolean,false));
$$;
select ok(not has_function_privilege('authenticated','private.discovery_notification_source(text,text)','EXECUTE'),'source resolver is not a client metadata API');
select ok(not has_function_privilege('service_role','private.enqueue_discovery_notification_source(text,text)','EXECUTE'),'no externally callable fanout API');
select ok(not has_table_privilege('authenticated','public.notification_activity_events','INSERT'),'clients cannot forge activity recipients');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.notification_activity_events'::regclass),'event queue retains FORCE RLS');

-- Explicit publication is required; simple room creation is not going live.
insert into public.watch_party_rooms(party_id,host_user_id,room_type,discovery_visibility) values
 ('DISCOVERY-LIVE','9d440000-0000-4000-8000-000000000001','live','public');
select is(pg_temp.discovery_count('followed_creator_live','DISCOVERY-LIVE'),0,'unpublished room creates no live alert');
update public.watch_party_rooms set discovery_started_at=now() where party_id='DISCOVERY-LIVE';
select is(pg_temp.discovery_count('followed_creator_live','DISCOVERY-LIVE'),1,'published public live derives exact follower');
select is(pg_temp.discovery_count('circle_friend_live','DISCOVERY-LIVE'),1,'friend who also follows gets one Circle alert');
select is((select array_agg(recipient_user_id order by recipient_user_id)::text from public.notification_activity_events
 where source_id='DISCOVERY-LIVE'),'{9d440000-0000-4000-8000-000000000002,9d440000-0000-4000-8000-000000000003}',
 'fanout candidates are exactly the current follower/friend union, not unrelated accounts');
select is(pg_temp.discovery_count('followed_creator_live','DISCOVERY-LIVE',true),1,'live current source resolves');
select is((select target_route from (select private.resolve_notification_activity(e)->>'target_route' target_route
 from public.notification_activity_events e where event_kind='followed_creator_live' and source_id='DISCOVERY-LIVE') q),
 '/watch-party/live-stage/[partyId]','live route uses guarded actual stage');
select ok((select bool_and(expires_at<=created_at+interval '10 minutes') from public.notification_activity_events
 where source_id='DISCOVERY-LIVE'),'live work has a finite 10 minute delivery horizon');
update public.watch_party_rooms set updated_at=now(),last_activity_at=now() where party_id='DISCOVERY-LIVE';
select is(pg_temp.discovery_count('followed_creator_live','DISCOVERY-LIVE'),1,'heartbeat does not fan out another alert');
update public.watch_party_rooms set is_active=false where party_id='DISCOVERY-LIVE';
select is(pg_temp.discovery_count('followed_creator_live','DISCOVERY-LIVE',true),0,'ended source suppresses queued live');
update public.watch_party_rooms set is_active=true where party_id='DISCOVERY-LIVE';
select is(pg_temp.discovery_count('followed_creator_live','DISCOVERY-LIVE'),1,'same live generation cannot resend');
delete from public.channel_followers where follower_user_id='9d440000-0000-4000-8000-000000000002';
select is(pg_temp.discovery_count('followed_creator_live','DISCOVERY-LIVE',true),0,'unfollow suppresses queued source');
insert into public.channel_followers(channel_user_id,follower_user_id) values
 ('9d440000-0000-4000-8000-000000000001','9d440000-0000-4000-8000-000000000002');
update public.user_friendships set status='removed' where user_low_id='9d440000-0000-4000-8000-000000000001';
select is(pg_temp.discovery_count('circle_friend_live','DISCOVERY-LIVE',true),0,'removed Circle membership suppresses queued source');
update public.user_friendships set status='active' where user_low_id='9d440000-0000-4000-8000-000000000001';
update public.watch_party_rooms set discovery_visibility='circle' where party_id='DISCOVERY-LIVE';
select is(pg_temp.discovery_count('followed_creator_live','DISCOVERY-LIVE',true),0,'public-to-Circle cannot disclose stale public live');
update public.watch_party_rooms set discovery_visibility='private' where party_id='DISCOVERY-LIVE';
select is(pg_temp.discovery_count('circle_friend_live','DISCOVERY-LIVE',true),0,'private live suppresses all queued discovery');

savepoint rolled_source;
insert into public.watch_party_rooms(party_id,host_user_id,room_type,discovery_visibility,discovery_started_at) values
 ('DISCOVERY-ROLLBACK','9d440000-0000-4000-8000-000000000001','live','public',now());
select is(pg_temp.discovery_count('followed_creator_live','DISCOVERY-ROLLBACK'),1,'source and outbox are in same transaction');
rollback to rolled_source;
select is(pg_temp.discovery_count('followed_creator_live','DISCOVERY-ROLLBACK'),0,'source rollback removes the queued alert');

-- An open room can still have a paid entry offer; it must not be advertised as free discovery.
savepoint paid_stage;
update public.watch_party_rooms set discovery_visibility='public' where party_id='DISCOVERY-LIVE';
insert into public.paid_live_watch_party_offers(id,party_id,creator_id,host_user_id,pass_type,product_id,provider,
 provider_product_id,price_cents,currency,environment,status) values
 ('9d446000-0000-4000-8000-000000000001','DISCOVERY-LIVE','9d440000-0000-4000-8000-000000000001',
 '9d440000-0000-4000-8000-000000000001','live_watch_party_access_pass',
 (select id from public.monetization_products where product_key='live_watch_party_access_pass_sandbox_099'),
 'revenuecat_google_play','cw_live_watch_party_access_sandbox_099',99,'usd','sandbox','sandbox');
select is(pg_temp.discovery_count('followed_creator_live','DISCOVERY-LIVE',true),0,'current paid entry offer suppresses an open room alert');
update public.paid_live_watch_party_offers set status='paused' where id='9d446000-0000-4000-8000-000000000001';
select is(pg_temp.discovery_count('circle_friend_live','DISCOVERY-LIVE',true),0,'paused paid offer does not imply free entry');
update public.paid_live_watch_party_offers set status='ended' where id='9d446000-0000-4000-8000-000000000001';
select is(pg_temp.discovery_count('followed_creator_live','DISCOVERY-LIVE',true),1,'ended entry offer restores exact open source eligibility');
rollback to paid_stage;

-- Actual scanner guards reset new media to pending; only its later clean write qualifies.
insert into public.videos(id,owner_id,title,visibility,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes) values
 ('9d441000-0000-4000-8000-000000000001','9d440000-0000-4000-8000-000000000001','Synthetic public upload','public',
 'cloudflare_r2','chillywood-media-origin','9d440000-0000-4000-8000-000000000001/9d441000-0000-4000-8000-000000000001/source.mp4',
 '9d440000-0000-4000-8000-000000000001/9d441000-0000-4000-8000-000000000001/source.mp4','video/mp4',1024);
select is(pg_temp.discovery_count('public_upload','9d441000-0000-4000-8000-000000000001'),0,'pending scan is not a public upload');
update public.videos set scan_status='clean',scan_provider='pgtap',scanned_at=now() where id='9d441000-0000-4000-8000-000000000001';
select is(pg_temp.discovery_count('public_upload','9d441000-0000-4000-8000-000000000001'),2,'clean public upload reaches current followers only');
select is(pg_temp.discovery_count('public_upload','9d441000-0000-4000-8000-000000000001',true),2,'public safe source resolves');
update public.videos set title='Edited synthetic title' where id='9d441000-0000-4000-8000-000000000001';
select is(pg_temp.discovery_count('public_upload','9d441000-0000-4000-8000-000000000001'),2,'ordinary title edit does not replay upload');
update public.videos set quarantined_at=now() where id='9d441000-0000-4000-8000-000000000001';
select is(pg_temp.discovery_count('public_upload','9d441000-0000-4000-8000-000000000001',true),0,'quarantine stops old queued upload');
update public.videos set quarantined_at=null where id='9d441000-0000-4000-8000-000000000001';
insert into public.creator_content_prices(creator_id,content_type,content_id,is_paid,price_cents,currency) values
 ('9d440000-0000-4000-8000-000000000001','creator_video','9d441000-0000-4000-8000-000000000001',true,100,'usd');
select is(pg_temp.discovery_count('public_upload','9d441000-0000-4000-8000-000000000001',true),0,'paid access is never labeled a free public upload');
delete from public.creator_content_prices where content_id='9d441000-0000-4000-8000-000000000001';
insert into public.channel_audience_blocks(channel_user_id,blocked_user_id,blocked_by_user_id) values
 ('9d440000-0000-4000-8000-000000000002','9d440000-0000-4000-8000-000000000001','9d440000-0000-4000-8000-000000000002');
select is(pg_temp.discovery_count('public_upload','9d441000-0000-4000-8000-000000000001',true),1,'current recipient block suppresses only that recipient');
delete from public.channel_audience_blocks where channel_user_id='9d440000-0000-4000-8000-000000000002';

-- Exact enrollment and event schedule revisions; stale revisions never dispatch.
insert into public.creator_events(id,host_user_id,event_title,event_type,status,visibility,starts_at,reminder_ready) values
 ('9d442000-0000-4000-8000-000000000001','9d440000-0000-4000-8000-000000000001','Synthetic event','live_first','scheduled','public',now()+interval '1 hour',true);
select is(pg_temp.discovery_count('event_starts_soon','9d442000-0000-4000-8000-000000000001'),0,'unenrolled viewers receive no reminder');
insert into public.event_reminders(event_id,user_id) values
 ('9d442000-0000-4000-8000-000000000001','9d440000-0000-4000-8000-000000000002');
select is(pg_temp.discovery_count('event_starts_soon','9d442000-0000-4000-8000-000000000001'),1,'active enrollment schedules one reminder');
select ok((select scheduled_at=now()+interval '45 minutes' and expires_at=now()+interval '1 hour'
 from public.notification_activity_events where event_kind='event_starts_soon' and source_id='9d442000-0000-4000-8000-000000000001'),
 'reminder waits until 15 minutes before exact start and expires at start');
select is(pg_temp.discovery_count('event_starts_soon','9d442000-0000-4000-8000-000000000001',true),0,'early direct resolver call cannot bypass reminder window');
update public.creator_events set starts_at=now()+interval '10 minutes' where id='9d442000-0000-4000-8000-000000000001';
select is(pg_temp.discovery_count('event_starts_soon','9d442000-0000-4000-8000-000000000001'),2,'reschedule creates new exact revision');
select is(pg_temp.discovery_count('event_starts_soon','9d442000-0000-4000-8000-000000000001',true),1,'only current revision is eligible');
select is(pg_temp.discovery_count('creator_event_updated','9d442000-0000-4000-8000-000000000001',true),1,'enrolled person gets current reschedule alert');
update public.event_reminders set status='canceled' where event_id='9d442000-0000-4000-8000-000000000001';
select is(pg_temp.discovery_count('event_starts_soon','9d442000-0000-4000-8000-000000000001',true),0,'reminder opt-out suppresses old work');
update public.event_reminders set status='active' where event_id='9d442000-0000-4000-8000-000000000001';
update public.creator_events set status='canceled' where id='9d442000-0000-4000-8000-000000000001';
select is(pg_temp.discovery_count('event_starts_soon','9d442000-0000-4000-8000-000000000001',true),0,'event cancellation prevents obsolete reminder');
select is(pg_temp.discovery_count('creator_event_canceled','9d442000-0000-4000-8000-000000000001',true),1,'actual cancellation alerts active enrollee');
update public.creator_events set visibility='private' where id='9d442000-0000-4000-8000-000000000001';
select is(pg_temp.discovery_count('creator_event_canceled','9d442000-0000-4000-8000-000000000001',true),0,'private event without pass cannot leak canceled content');

savepoint stale_private_pass;
insert into public.paid_creator_events(id,creator_event_id,creator_id,title,event_type) values
 ('9d447000-0000-4000-8000-000000000001','9d442000-0000-4000-8000-000000000001',
 '9d440000-0000-4000-8000-000000000001','Synthetic paid event','live_first');
insert into public.paid_creator_event_passes(id,event_id,creator_event_id,buyer_id,creator_id,status) values
 ('9d448000-0000-4000-8000-000000000001','9d447000-0000-4000-8000-000000000001',
 '9d442000-0000-4000-8000-000000000001','9d440000-0000-4000-8000-000000000002',
 '9d440000-0000-4000-8000-000000000001','active');
select ok(not private.discovery_notification_event_visible((select e from public.creator_events e
 where id='9d442000-0000-4000-8000-000000000001'),'9d440000-0000-4000-8000-000000000002'),
 'an active-looking pass without its exact grant cannot disclose a private event');
insert into public.access_grants(id,user_id,grant_type,source_type,source_id,environment,status) values
 ('9d449000-0000-4000-8000-000000000001','9d440000-0000-4000-8000-000000000002','event_pass','setup',
 '9d442000-0000-4000-8000-000000000001','setup','setup_only');
update public.paid_creator_event_passes set access_grant_id='9d449000-0000-4000-8000-000000000001'
 where id='9d448000-0000-4000-8000-000000000001';
select ok(not private.discovery_notification_event_visible((select e from public.creator_events e
 where id='9d442000-0000-4000-8000-000000000001'),'9d440000-0000-4000-8000-000000000002'),
 'exact grant pointer without processed provider/consumed purchase identity remains ineligible');
update public.paid_creator_event_passes set refunded_at=now() where id='9d448000-0000-4000-8000-000000000001';
select ok(not private.discovery_notification_event_visible((select e from public.creator_events e
 where id='9d442000-0000-4000-8000-000000000001'),'9d440000-0000-4000-8000-000000000002'),
 'refunded timestamp denies a stale active private pass');
update public.paid_creator_event_passes set refunded_at=null,revoked_at=now() where id='9d448000-0000-4000-8000-000000000001';
select ok(not private.discovery_notification_event_visible((select e from public.creator_events e
 where id='9d442000-0000-4000-8000-000000000001'),'9d440000-0000-4000-8000-000000000002'),
 'revoked timestamp denies a stale active private pass');
update public.paid_creator_event_passes set revoked_at=null where id='9d448000-0000-4000-8000-000000000001';
-- Only this injected authority failure is modeled; the wrapper must not turn
-- an unexpected database exception into a permanent source suppression.
create or replace function public.creator_money_historical_purchase_identity_internal(
 p_user_id uuid,p_grant_type text,p_source_id uuid,p_expected_access_grant_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin raise exception 'discovery_test_unexpected_authority_failure'; end $$;
select throws_ok($$select private.discovery_notification_event_visible((select e from public.creator_events e
 where id='9d442000-0000-4000-8000-000000000001'),'9d440000-0000-4000-8000-000000000002')$$,
 'P0001','discovery_test_unexpected_authority_failure','unexpected authority errors remain retryable and are not silently suppressed');
rollback to stale_private_pass;

insert into public.creator_events(id,host_user_id,event_title,event_type,status,visibility,starts_at,reminder_ready) values
 ('9d442000-0000-4000-8000-000000000002','9d440000-0000-4000-8000-000000000001','Synthetic party','watch_party_live','scheduled','circle',now()+interval '10 minutes',true);
insert into public.event_reminders(event_id,user_id) values
 ('9d442000-0000-4000-8000-000000000002','9d440000-0000-4000-8000-000000000003'),
 ('9d442000-0000-4000-8000-000000000002','9d440000-0000-4000-8000-000000000004');
select is(pg_temp.discovery_count('watch_party_starts_soon','9d442000-0000-4000-8000-000000000002'),1,'Circle reminder excludes enrolled-but-unauthorized outsider');
select is(pg_temp.discovery_count('watch_party_starts_soon','9d442000-0000-4000-8000-000000000002',true),1,'current Circle Watch-Party event resolves');

-- Approved broadcast state is insufficient until the exact playback is live.
insert into public.watch_party_rooms(party_id,host_user_id,room_type) values
 ('DISCOVERY-BROADCAST','9d440000-0000-4000-8000-000000000001','live');
insert into public.room_broadcast_sessions(id,source_type,source_room_id,host_user_id,channel_user_id,broadcast_status,
 hls_playback_url,playback_url_status,rights_status,access_type,is_publicly_watchable,is_spectator_playback_enabled,requires_premium,requires_ticket,metadata) values
 ('9d443000-0000-4000-8000-000000000001','watch_party_room','DISCOVERY-BROADCAST',
 '9d440000-0000-4000-8000-000000000001','9d440000-0000-4000-8000-000000000001','active_later',
 'https://example.invalid/discovery.m3u8','public_safe_available','creator_owned','public_free',true,true,false,false,'{"d7f_public_safe_approved":true}');
select is(pg_temp.discovery_count('followed_creator_live','9d443000-0000-4000-8000-000000000001'),0,'broadcast alone is not spectator availability');
insert into public.spectator_hls_playback_records(id,broadcast_session_id,source_room_id,host_user_id,visibility,
 playback_status,playlist_path,rights_status,access_type,is_publicly_watchable,is_spectator_playback_enabled,requires_premium,requires_ticket) values
 ('9d444000-0000-4000-8000-000000000001','9d443000-0000-4000-8000-000000000001','DISCOVERY-BROADCAST',
 '9d440000-0000-4000-8000-000000000001','public','live','discovery/index.m3u8','creator_owned','public_free',true,true,false,false);
select is(pg_temp.discovery_count('followed_creator_live','9d443000-0000-4000-8000-000000000001',true),1,'matching public-safe playback triggers actual follower alert');
update public.spectator_hls_playback_records set playback_status='ended' where id='9d444000-0000-4000-8000-000000000001';
select is(pg_temp.discovery_count('followed_creator_live','9d443000-0000-4000-8000-000000000001',true),0,'ended playback cannot announce live');

insert into public.creator_replay_library_items(id,owner_user_id,source_type,broadcast_session_id,title,visibility,
 rights_status,save_status,playback_record_id) values
 ('9d445000-0000-4000-8000-000000000001','9d440000-0000-4000-8000-000000000001','watch_party_live',
 '9d443000-0000-4000-8000-000000000001','Synthetic replay','public','creator_owned','processing_replay','9d444000-0000-4000-8000-000000000001');
select is(pg_temp.discovery_count('replay_later','9d445000-0000-4000-8000-000000000001'),0,'processing is not replay ready');
update public.creator_replay_library_items set save_status='ready' where id='9d445000-0000-4000-8000-000000000001';
select is(pg_temp.discovery_count('replay_later','9d445000-0000-4000-8000-000000000001',true),2,'actual free ready replay reaches followers');
select is((select private.resolve_notification_activity(e)->>'deep_link' from public.notification_activity_events e
 where event_kind='replay_later' and recipient_user_id='9d440000-0000-4000-8000-000000000002'),
 '/player/replay/9d445000-0000-4000-8000-000000000001','replay resolves real guarded screen');
update public.creator_replay_library_items set money_status='paid' where id='9d445000-0000-4000-8000-000000000001';
select is(pg_temp.discovery_count('replay_later','9d445000-0000-4000-8000-000000000001',true),0,'paid replay never bypasses entitlement flow');
update public.creator_replay_library_items set money_status='free',rights_status='private_use_only' where id='9d445000-0000-4000-8000-000000000001';
select is(pg_temp.discovery_count('replay_later','9d445000-0000-4000-8000-000000000001',true),0,'lost replay rights suppress queued alert');
update public.creator_replay_library_items set rights_status='creator_owned',visibility='draft' where id='9d445000-0000-4000-8000-000000000001';
select is(pg_temp.discovery_count('replay_later','9d445000-0000-4000-8000-000000000001',true),0,'replay draft stays private');
update public.creator_replay_library_items set visibility='public' where id='9d445000-0000-4000-8000-000000000001';
update public.spectator_hls_playback_records set host_user_id='9d440000-0000-4000-8000-000000000004'
 where id='9d444000-0000-4000-8000-000000000001';
select is(pg_temp.discovery_count('replay_later','9d445000-0000-4000-8000-000000000001',true),0,'replay cannot borrow another owner playback record');
update public.spectator_hls_playback_records set host_user_id='9d440000-0000-4000-8000-000000000001'
 where id='9d444000-0000-4000-8000-000000000001';
select is(pg_temp.discovery_count('replay_later','9d445000-0000-4000-8000-000000000001'),2,'hide/restore does not duplicate replay generation');
savepoint replay_current_source;
update public.spectator_hls_playback_records set visibility='circle'
 where id='9d444000-0000-4000-8000-000000000001';
select is(pg_temp.discovery_count('replay_later','9d445000-0000-4000-8000-000000000001',true),0,'public replay cannot borrow Circle-only playback');
rollback to replay_current_source;
savepoint replay_current_source;
update public.room_broadcast_sessions set host_user_id='9d440000-0000-4000-8000-000000000004'
 where id='9d443000-0000-4000-8000-000000000001';
select is(pg_temp.discovery_count('replay_later','9d445000-0000-4000-8000-000000000001',true),0,'replay requires the exact broadcast owner too');
rollback to replay_current_source;
savepoint replay_current_source;
update public.room_broadcast_sessions set metadata=metadata-'d7f_public_safe_approved'
 where id='9d443000-0000-4000-8000-000000000001';
select is(pg_temp.discovery_count('replay_later','9d445000-0000-4000-8000-000000000001',true),0,'missing public safety approval fails closed rather than SQL null bypass');
rollback to replay_current_source;
savepoint replay_current_source;
update public.room_broadcast_sessions set requires_ticket=true,hls_playback_url=null,
 is_publicly_watchable=false,is_spectator_playback_enabled=false,access_type='ticketed',playback_url_status='blocked_by_access'
 where id='9d443000-0000-4000-8000-000000000001';
select is(pg_temp.discovery_count('replay_later','9d445000-0000-4000-8000-000000000001',true),0,'current paid broadcast suppresses a stale free replay');
rollback to replay_current_source;

-- Real common materialization validates the stored type and actual target.
insert into public.notification_preferences(user_id,public_upload_enabled) values
 ('9d440000-0000-4000-8000-000000000002',false);
select is(pg_temp.discovery_count('public_upload','9d441000-0000-4000-8000-000000000001',true),1,'current per-kind preference suppresses delivery');
do $$ declare c jsonb; rounds integer; begin
 for rounds in 1..4 loop
  for c in select public.claim_notification_activity_batch(10) loop
   perform public.prepare_notification_activity((c->>'eventId')::uuid,(c->>'leaseToken')::uuid);
   perform public.prepare_notification_activity((c->>'eventId')::uuid,(c->>'leaseToken')::uuid);
   perform public.finish_notification_activity((c->>'eventId')::uuid,(c->>'leaseToken')::uuid);
  end loop;
 end loop;
end $$;
select is((select count(*)::integer from public.notifications where notification_type='public_upload'
 and actor_user_id='9d440000-0000-4000-8000-000000000001'),1,'materializer writes only authorized upload recipient once');
select is((select count(*)::integer from public.notifications where notification_type='replay_later'
 and actor_user_id='9d440000-0000-4000-8000-000000000001'),2,'materializer accepts real replay type and guarded route once per recipient');
select is((select count(*)::integer from public.notifications where notification_type='creator_event_canceled'
 and actor_user_id='9d440000-0000-4000-8000-000000000001'),0,'stale or private canceled source materializes no row');
savepoint stale_expiry;
update public.notification_activity_events set expires_at=now()-interval '1 second'
 where source_id='9d445000-0000-4000-8000-000000000001';
select is(pg_temp.discovery_count('replay_later','9d445000-0000-4000-8000-000000000001',true),0,'expired queue entry cannot be delivered');
rollback to stale_expiry;

select is((select count(*)::integer from public.notification_activity_events where actor_user_id=recipient_user_id),0,'no self notifications');
select ok(not exists(select 1 from public.notification_activity_events where context::text ~ '(https:|source.mp4|index.m3u8)'),
 'outbox never contains protected playback URL or storage path');
select ok((select bool_and(expires_at is not null and expires_at>created_at) from public.notification_activity_events
 where actor_user_id='9d440000-0000-4000-8000-000000000001'),'every delivery has bounded freshness');
set local role authenticated;
select throws_ok($$select private.enqueue_discovery_notification_source('video','9d441000-0000-4000-8000-000000000001')$$,
 '42501',null,'recipient cannot invoke private fanout');
reset role;
select * from finish();
rollback;
