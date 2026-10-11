begin;
select no_plan();
create function pg_temp.party_user(n integer) returns uuid language sql immutable as $$
  select ('ac110000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.party_session(n integer) returns uuid language sql immutable as $$
  select ('ac110001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.party_login(n integer) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.party_user(n),'session_id',pg_temp.party_session(n))::text,true);
end $$;
insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at)
  select pg_temp.party_user(n),false,false,now() from generate_series(1,5) n;
insert into auth.sessions(id,user_id,not_after)
  select pg_temp.party_session(n),pg_temp.party_user(n),now()+interval '1 day' from generate_series(1,5) n;
insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
  select pg_temp.party_user(n),public.wave1_sha256(pg_temp.party_user(n)::text),d.document_key,d.version,d.market,'member',d.capability,pg_temp.party_session(n)::text,'service_reconciliation'
  from generate_series(1,5) n cross join public.wave1_legal_document_versions d
  where d.active and d.market='UNITED_STATES' and d.capability='account';
update public.platform_money_kill_switches set state='sandbox_only'
  where key in ('revenuecat_google_play_enabled','provider_webhooks_enabled');
create function pg_temp.party_premium(n integer) returns jsonb language sql volatile as $$
  select public.process_revenuecat_premium_event_atomic('revenuecat_google_play','party-audience-premium-'||n,'INITIAL_PURCHASE',pg_temp.party_user(n),
    p.provider_product_id,p.provider_base_plan_id,'sandbox','active',now()-interval '1 minute',now()+interval '1 day',now(),999,'usd',repeat(n::text,64),
    'NORMAL','google_play','android',null,p.id,'party-audience-original-'||n)
  from public.monetization_products p where p.provider='revenuecat_google_play' and p.environment='sandbox'
    and p.product_type='premium_subscription' and p.status='sandbox' order by p.created_at,p.id limit 1;
$$;
select is(pg_temp.party_premium(1)->>'status','processed','host gets finite Premium through actual sandbox authority RPC');
select is(pg_temp.party_premium(2)->>'status','processed','friend gets independently backed Premium');
select is(pg_temp.party_premium(3)->>'status','processed','stranger gets independently backed Premium');
select ok(public.premium_subject_has_finite_authority_internal(pg_temp.party_user(1)::text),'host finite authority is real');
select ok(not has_table_privilege('authenticated','private.party_room_discovery_publications','INSERT'),'client cannot manufacture publication marker');
select ok(not has_function_privilege('anon','public.publish_party_room_discovery(text,text,text,text)','EXECUTE'),'anonymous publication denied');
select ok(not has_function_privilege('authenticated','public.resolve_watch_party_livekit_viewer_authority(text,uuid,uuid)','EXECUTE'),'media authority remains service-only');
select ok(not has_function_privilege('authenticated','public.join_watch_party_room_session_pre_party_room(text,text,text,text,boolean,boolean,boolean)','EXECUTE'),'client cannot call previous join to bypass new gate');
select is((select count(*)::integer from private.party_room_discovery_publications),0,'installation backfills no room');

insert into public.titles(id,title,video_url,is_published,status) values
  ('ac110002-0000-4000-8000-000000000001','Party source metadata','https://example.invalid/private-playback.mp4',true,'published'),
  ('ac110002-0000-4000-8000-000000000002','Unreleased','https://example.invalid/not-public.mp4',false,'draft');
insert into public.user_friendships(user_low_id,user_high_id,requested_by_user_id,status,responded_at,actioned_by_user_id)
  values(pg_temp.party_user(1)::text,pg_temp.party_user(2)::text,pg_temp.party_user(1)::text,'active',now(),pg_temp.party_user(2)::text);
insert into public.channel_followers(channel_user_id,follower_user_id) values
  (pg_temp.party_user(1)::text,pg_temp.party_user(2)::text),(pg_temp.party_user(1)::text,pg_temp.party_user(3)::text);
select pg_temp.party_login(1);
set local role authenticated;
select lives_ok($$insert into public.watch_party_rooms(party_id,host_user_id,title_id,source_type,source_id,room_type,content_access_rule)
  values('PARTY-AUDIENCE-01',auth.uid(),'ac110002-0000-4000-8000-000000000001','platform_title','ac110002-0000-4000-8000-000000000001','title','premium')$$,
  'normal host creates actual room under unchanged RLS');
select is((select discovery_visibility from public.watch_party_rooms where party_id='PARTY-AUDIENCE-01'),'private','new ordinary room defaults private');
select is(public.set_party_room_discovery('PARTY-AUDIENCE-01','public','Exact party title','platform_title','ac110002-0000-4000-8000-000000000001',pg_temp.party_session(1)::text)->>'published','false','prepared public selection is not publication');
select throws_ok($$select public.publish_party_room_discovery('PARTY-AUDIENCE-01','platform_title','ac110002-0000-4000-8000-000000000001',pg_temp.party_session(1)::text)$$,
  'party_room_joined_host_required','preparation/navigation without actual joined host cannot publish');
select throws_ok($$select public.publish_party_room_discovery('PARTY-AUDIENCE-01','platform_title','ac110002-0000-4000-8000-000000000002',pg_temp.party_session(1)::text)$$,
  'party_room_source_changed','stale source intent cannot publish');
select throws_ok($$select public.publish_party_room_discovery('PARTY-AUDIENCE-01','platform_title','ac110002-0000-4000-8000-000000000001',pg_temp.party_session(2)::text)$$,
  'party_room_current_session_required','another session generation is rejected');
select lives_ok($$select public.join_watch_party_room_session('PARTY-AUDIENCE-01')$$,'actual current host joins with normal RPC');
select is(public.publish_party_room_discovery('PARTY-AUDIENCE-01','platform_title','ac110002-0000-4000-8000-000000000001',pg_temp.party_session(1)::text)->>'published','true','explicit host start after actual join publishes metadata');
reset role;
select is((select count(*)::integer from public.discovery_feed_items where source_type='party_room' and source_id='PARTY-AUDIENCE-01' and is_publicly_discoverable),1,'one canonical public row');
select ok((select rights_status='metadata_only' and not is_spectator_enabled and not is_spectator_playback_enabled and not allow_spectator_view
  and access_type='premium_only' and requires_premium_to_join and metadata->>'destination'='party_room_join'
  and metadata::text not like '%example.invalid%' and metadata::text not like '%token%'
  from public.discovery_feed_items where source_type='party_room' and source_id='PARTY-AUDIENCE-01'),'metadata row carries no media and preserves Premium');
select is((select count(*)::integer from public.notification_activity_events where context->>'sourceType'='party_room'),2,'friend/follower overlap yields one recipient event each');
select is((select event_kind from public.notification_activity_events where context->>'sourceType'='party_room' and recipient_user_id=pg_temp.party_user(2)),'circle_friend_live','Circle precedence avoids duplicate follower alert');
select ok((select private.resolve_discovery_notification_activity(e)->>'target_entity_id'=(select id::text from public.discovery_feed_items where source_type='party_room' and source_id='PARTY-AUDIENCE-01')
  and private.resolve_discovery_notification_activity(e)->>'target_route'='/spectate/[itemId]'
  from public.notification_activity_events e where context->>'sourceType'='party_room' and recipient_user_id=pg_temp.party_user(3)),
  'notification resolves exact existing canonical guarded destination');
select pg_temp.party_login(1);
set local role authenticated;
select is(public.publish_party_room_discovery('PARTY-AUDIENCE-01','platform_title','ac110002-0000-4000-8000-000000000001',pg_temp.party_session(1)::text)->>'published','true','same exact publication retry is successful');
reset role;
select is((select count(*)::integer from public.notification_activity_events where context->>'sourceType'='party_room'),2,'retries do not resend or duplicate recipient events');
select pg_temp.party_login(3);
set local role authenticated;
select is((select count(*)::integer from public.discovery_feed_items where source_type='party_room' and source_id='PARTY-AUDIENCE-01'),1,'ordinary unrelated authenticated viewer can read public metadata via RLS');
select throws_ok($$select public.set_party_room_discovery('PARTY-AUDIENCE-01','private',null,'platform_title','ac110002-0000-4000-8000-000000000001',pg_temp.party_session(3)::text)$$,
  'party_room_host_required','viewer cannot change owner audience');
select lives_ok($$select public.join_watch_party_room_session('PARTY-AUDIENCE-01')$$,'public viewer with current Premium uses normal join');
reset role;
select pg_temp.party_login(1);
set local role authenticated;
select is(public.set_party_room_discovery('PARTY-AUDIENCE-01','circle','Circle party','platform_title','ac110002-0000-4000-8000-000000000001',pg_temp.party_session(1)::text)->>'published','true','host switches started room to Circle');
reset role;
select is((select count(*)::integer from public.discovery_feed_items where source_type='party_room' and is_publicly_discoverable),0,'Circle switch immediately removes public projection');
select pg_temp.party_login(3);
set local role authenticated;
select is((select count(*)::integer from public.circle_spectator_feed_items where source_type='party_room'),0,'nonmember cannot read Circle metadata through RLS');
select throws_ok($$select public.join_watch_party_room_session('PARTY-AUDIENCE-01')$$,'party_room_viewer_authority_required','guessed Circle code rejects unrelated former public member');
reset role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
select is(public.resolve_watch_party_livekit_viewer_authority('PARTY-AUDIENCE-01',pg_temp.party_user(3),pg_temp.party_session(3))->>'allowed','false','Circle change revokes unrelated media token authority');
reset role;
select pg_temp.party_login(2);
set local role authenticated;
select is((select count(*)::integer from public.circle_spectator_feed_items where source_type='party_room'),1,'active Circle member reads metadata');
select lives_ok($$select public.join_watch_party_room_session('PARTY-AUDIENCE-01')$$,'current eligible Circle member joins normally');
reset role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
select is(public.resolve_watch_party_livekit_viewer_authority('PARTY-AUDIENCE-01',pg_temp.party_user(2),pg_temp.party_session(2))->>'allowed','true','Circle member retains actual service media authority');
reset role;
select pg_temp.party_login(1);
set local role authenticated;
select is(public.set_party_room_discovery('PARTY-AUDIENCE-01','private',null,'platform_title','ac110002-0000-4000-8000-000000000001',pg_temp.party_session(1)::text)->>'published','false','private hides started room normally');
reset role;
select is((select count(*)::integer from public.circle_spectator_feed_items where source_type='party_room' and status='active'),0,'private switch immediately hides Circle row');
select ok(not exists(select 1 from public.notification_activity_events e where context->>'sourceType'='party_room'
  and private.resolve_discovery_notification_activity(e)->>'eligible'='true'),'queued stale public/Circle notifications cannot deliver after private');
select pg_temp.party_login(1);
set local role authenticated;
select is(public.set_party_room_discovery('PARTY-AUDIENCE-01','public','Restored','platform_title','ac110002-0000-4000-8000-000000000001',pg_temp.party_session(1)::text)->>'published','true','same real start may be reshown after explicit audience save');
reset role;
savepoint stale_session;
update auth.sessions set not_after=now()-interval '1 second' where id=pg_temp.party_session(1);
select pg_temp.party_login(3);
set local role authenticated;
select is((select count(*)::integer from public.discovery_feed_items where source_type='party_room'),0,'elapsed host session immediately hides listing without relying on new writes');
reset role;
rollback to stale_session;
savepoint expired_host;
update public.user_entitlements set expires_at=now()-interval '1 second' where user_id=pg_temp.party_user(1)::text and entitlement_key='premium';
select pg_temp.party_login(3);
set local role authenticated;
select is((select count(*)::integer from public.discovery_feed_items where source_type='party_room'),0,'expired host Premium is not public listing authority');
reset role;
rollback to expired_host;
savepoint stale_presence;
update public.watch_party_room_memberships set last_seen_at=now()-interval '46 seconds' where party_id='PARTY-AUDIENCE-01' and user_id=pg_temp.party_user(1)::text;
select pg_temp.party_login(3);
set local role authenticated;
select is((select count(*)::integer from public.discovery_feed_items where source_type='party_room'),0,'stale host presence cannot keep a public listing');
reset role;
rollback to stale_presence;
savepoint revoked_source;
update public.titles set is_published=false where id='ac110002-0000-4000-8000-000000000001';
select ok((select not is_publicly_discoverable and live_state='ended' from public.discovery_feed_items where source_type='party_room'),'source unpublish retires projection data immediately');
select ok((select retired_at is not null from private.party_room_discovery_publications where party_id='PARTY-AUDIENCE-01'),'unpublished source retires exact explicit-start marker');
update public.titles set is_published=true where id='ac110002-0000-4000-8000-000000000001';
select ok(not private.party_room_publication_current('PARTY-AUDIENCE-01'),'republishing source alone cannot resurrect old room start');
rollback to revoked_source;
-- Inserted before the final owner End in the full actual-role suite.
savepoint anonymous_metadata;
select set_config('request.jwt.claim.role','anon',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
select is((select count(*)::integer from public.discovery_feed_items where source_type='party_room'),0,
  'old permissive anonymous policy cannot admit metadata_only Party Room rows');
reset role;
rollback to anonymous_metadata;

savepoint circle_removed;
select pg_temp.party_login(1);
set local role authenticated;
select public.set_party_room_discovery('PARTY-AUDIENCE-01','circle','Current Circle','platform_title','ac110002-0000-4000-8000-000000000001',pg_temp.party_session(1)::text);
reset role;
delete from public.user_friendships where user_low_id=pg_temp.party_user(1)::text and user_high_id=pg_temp.party_user(2)::text;
select pg_temp.party_login(2);
set local role authenticated;
select is((select count(*)::integer from public.circle_spectator_feed_items where source_type='party_room'),0,'removed friend immediately loses Circle row despite cached projection');
select throws_ok($$select public.join_watch_party_room_session('PARTY-AUDIENCE-01')$$,'party_room_viewer_authority_required','removed friend cannot rejoin by saved room code');
reset role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
select is(public.resolve_watch_party_livekit_viewer_authority('PARTY-AUDIENCE-01',pg_temp.party_user(2),pg_temp.party_session(2))->>'allowed','false','removed friend loses service media authority');
reset role;
rollback to circle_removed;

savepoint blocked_recipient;
insert into public.channel_audience_blocks(channel_user_id,blocked_user_id,blocked_by_user_id) values(pg_temp.party_user(1)::text,pg_temp.party_user(3)::text,pg_temp.party_user(1)::text);
select pg_temp.party_login(3);
set local role authenticated;
select is((select count(*)::integer from public.discovery_feed_items where source_type='party_room'),0,'current block hides public metadata through actual RLS');
select throws_ok($$select public.join_watch_party_room_session('PARTY-AUDIENCE-01')$$,'party_room_viewer_authority_required','blocked public viewer cannot join');
reset role;
select ok(not exists(select 1 from public.notification_activity_events e where context->>'sourceType'='party_room' and recipient_user_id=pg_temp.party_user(3)
  and private.resolve_discovery_notification_activity(e)->>'eligible'='true'),'blocked exact recipient is ineligible for queued alert');
rollback to blocked_recipient;

savepoint viewer_expired;
update public.user_entitlements set expires_at=now()-interval '1 second' where user_id=pg_temp.party_user(3)::text and entitlement_key='premium';
select pg_temp.party_login(3);
set local role authenticated;
select throws_ok($$select public.join_watch_party_room_session('PARTY-AUDIENCE-01')$$,'party_room_viewer_authority_required','free-room viewer requires fresh Premium at join');
reset role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
select is(public.resolve_watch_party_livekit_viewer_authority('PARTY-AUDIENCE-01',pg_temp.party_user(3),pg_temp.party_session(3))->>'allowed','false','service correction cannot revive expired Premium');
reset role;
rollback to viewer_expired;

savepoint session_revoked;
delete from auth.sessions where id=pg_temp.party_session(1);
select pg_temp.party_login(3);
set local role authenticated;
select is((select count(*)::integer from public.discovery_feed_items where source_type='party_room'),0,'revoking bound host session immediately closes metadata read');
reset role;
select is((select count(*)::integer from private.party_room_discovery_publications),0,'host session revocation removes only bound publication proof');
rollback to session_revoked;

savepoint host_left;
select pg_temp.party_login(1);
set local role authenticated;
select lives_ok($$select public.heartbeat_watch_party_room_session('PARTY-AUDIENCE-01','left')$$,
  'host normal self-leave uses existing membership authority');
reset role;
select pg_temp.party_login(3);
set local role authenticated;
select is((select count(*)::integer from public.discovery_feed_items where source_type='party_room'),0,'left host cannot retain a public live listing');
reset role;
rollback to host_left;

savepoint source_deleted;
delete from public.titles where id='ac110002-0000-4000-8000-000000000001';
select ok((select not is_publicly_discoverable and live_state='ended' from public.discovery_feed_items where source_type='party_room'),'source deletion removes projection without exposing stored metadata');
select ok(not private.party_room_publication_current('PARTY-AUDIENCE-01'),'deleted source cannot retain publication authority');
rollback to source_deleted;

savepoint unbacked_paid_offer;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into public.paid_watch_party_offers(id,party_id,creator_id,host_id,title,price_cents,currency,status,provider,provider_product_key,provider_product_id)
select 'ac110003-0000-4000-8000-000000000001','PARTY-AUDIENCE-01',pg_temp.party_user(1),pg_temp.party_user(1),'Exact paid room',99,'usd','sandbox','revenuecat_google_play',p.product_key,p.provider_product_id
  from public.monetization_products p where p.product_key='watch_party_live_ticket_sandbox_099';
select is((select count(*)::integer from public.paid_watch_party_offers where party_id='PARTY-AUDIENCE-01'),1,'paid negative uses a real exact offer row');
set local role service_role;
select is(public.resolve_watch_party_livekit_viewer_authority('PARTY-AUDIENCE-01',pg_temp.party_user(3),pg_temp.party_session(3))->>'allowed','false','new service correction never overrides missing exact paid pass');
reset role;
select ok(not private.party_room_publication_current('PARTY-AUDIENCE-01'),'unbacked paid-host authority cannot keep listing alive');
rollback to unbacked_paid_offer;

savepoint observer_without_membership;
delete from public.watch_party_room_memberships where party_id='PARTY-AUDIENCE-01' and user_id=pg_temp.party_user(3)::text;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
select is(public.resolve_watch_party_livekit_viewer_authority('PARTY-AUDIENCE-01',pg_temp.party_user(3),pg_temp.party_session(3))->>'allowed','false','service correction requires actual current exact membership');
select is(public.resolve_watch_party_livekit_viewer_authority('PARTY-AUDIENCE-01',pg_temp.party_user(2),pg_temp.party_session(3))->>'allowed','false','cross-user session cannot qualify exact target');
select ok((public.resolve_watch_party_livekit_viewer_authority('PARTY-AUDIENCE-01',pg_temp.party_user(2),pg_temp.party_session(2))->>'expiresAt')::timestamptz<=now()+interval '30 seconds',
  'corrected nonpaid target grant has bounded short expiry');
reset role;
rollback to observer_without_membership;

savepoint preference_off;
insert into public.notification_preferences(user_id,circle_friend_live_enabled) values(pg_temp.party_user(2),false)
  on conflict(user_id) do update set circle_friend_live_enabled=false;
select ok(not exists(select 1 from public.notification_activity_events e where context->>'sourceType'='party_room' and recipient_user_id=pg_temp.party_user(2)
  and private.resolve_notification_activity(e)->>'eligible'='true'),'actual common resolver enforces Circle live preference for the new source');
rollback to preference_off;

savepoint creator_sources;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into public.videos(id,owner_id,title,visibility,moderation_status,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes)
  values('ac110004-0000-4000-8000-000000000001',pg_temp.party_user(1),'Creator source','public','clean','cloudflare_r2','chillywood-media-origin',
    pg_temp.party_user(1)::text||'/party-source.mp4',pg_temp.party_user(1)::text||'/party-source.mp4','video/mp4',1024);
update public.videos set scan_status='clean',scan_provider='pgtap',scan_result='clean',scanned_at=now() where id='ac110004-0000-4000-8000-000000000001';
select pg_temp.party_login(1);
set local role authenticated;
select lives_ok($$insert into public.watch_party_rooms(party_id,host_user_id,source_type,source_id,room_type,content_access_rule)
  values('PARTY-CREATOR-01',auth.uid(),'creator_video','ac110004-0000-4000-8000-000000000001','title','premium')$$,'public creator content prepares a normal private Party Room');
select is(public.set_party_room_discovery('PARTY-CREATOR-01','circle','Creator Circle','creator_video','ac110004-0000-4000-8000-000000000001',pg_temp.party_session(1)::text)->>'published','false','Circle creator source remains unlisted before real Start');
select lives_ok($$select public.join_watch_party_room_session('PARTY-CREATOR-01')$$,'creator host enters via actual normal join');
select is(public.publish_party_room_discovery('PARTY-CREATOR-01','creator_video','ac110004-0000-4000-8000-000000000001',pg_temp.party_session(1)::text)->>'published','true','public creator source can have a Circle-limited Party Room');
reset role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.videos set visibility='circle' where id='ac110004-0000-4000-8000-000000000001';
select ok(not private.party_room_publication_current('PARTY-CREATOR-01'),'changing video itself to Circle retires public-source metadata capability');
select pg_temp.party_login(1);
set local role authenticated;
select throws_ok($$select public.set_party_room_discovery('PARTY-CREATOR-01','circle','Not a public source','creator_video','ac110004-0000-4000-8000-000000000001',pg_temp.party_session(1)::text)$$,
  'party_room_source_authority_required','Circle Party choice cannot silently republish a Circle/private creator video');
reset role;
select is((select visibility from public.videos where id='ac110004-0000-4000-8000-000000000001'),'circle','source visibility remains unchanged by failed audience request');
rollback to creator_sources;

select pg_temp.party_login(1);
set local role authenticated;
select lives_ok($$update public.watch_party_rooms set is_active=false where party_id='PARTY-AUDIENCE-01'$$,'normal owner End remains authorized');
reset role;
select ok((select not is_publicly_discoverable and live_state='ended' from public.discovery_feed_items where source_type='party_room'),'End removes current public projection');
select ok((select retired_at is not null from private.party_room_discovery_publications where party_id='PARTY-AUDIENCE-01'),'End retires publication generation');
select ok(not exists(select 1 from public.notification_activity_events e where context->>'sourceType'='party_room'
  and private.resolve_discovery_notification_activity(e)->>'eligible'='true'),'ended notification cannot route as current');
select is((select count(*)::integer from public.room_broadcast_sessions where source_room_id='PARTY-AUDIENCE-01'),0,'ordinary audience never creates a broadcaster');
select is((select count(*)::integer from public.spectator_hls_playback_records where source_room_id='PARTY-AUDIENCE-01'),0,'ordinary audience never creates an HLS record');
select * from finish();
rollback;
