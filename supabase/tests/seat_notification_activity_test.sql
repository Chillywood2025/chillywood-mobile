begin;
select no_plan();
set local timezone='UTC';
-- Synthetic paid/provider records, actual production request/review/host-role
-- functions and notification materializer. No external purchase/provider call.
do $$ begin
 if not exists(select 1 from pg_trigger where tgrelid='public.notifications'::regclass
   and tgname='notification_seat_to_activity_before_insert') then
  create trigger notification_seat_to_activity_before_insert before insert on public.notifications
    for each row execute function private.route_legacy_seat_notification_to_activity();
 end if;
end $$;
insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at) values
 ('9e550000-0000-4000-8000-000000000001',false,false,now()),
 ('9e550000-0000-4000-8000-000000000002',false,false,now()),
 ('9e550000-0000-4000-8000-000000000003',false,false,now());
insert into auth.sessions(id,user_id,not_after) values
 ('9e550000-0000-4000-8000-000000000101','9e550000-0000-4000-8000-000000000001',now()+interval '1 day'),
 ('9e550000-0000-4000-8000-000000000102','9e550000-0000-4000-8000-000000000002',now()+interval '1 day'),
 ('9e550000-0000-4000-8000-000000000103','9e550000-0000-4000-8000-000000000003',now()+interval '1 day');
insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
 select s.user_id,public.wave1_sha256(s.user_id::text),d.document_key,d.version,d.market,'member',d.capability,s.id::text,'service_reconciliation'
 from auth.sessions s cross join public.wave1_legal_document_versions d
 where s.user_id::text like '9e550000-%' and d.active and d.market='UNITED_STATES' and d.capability='account';
insert into public.watch_party_rooms(party_id,host_user_id,room_type,discovery_visibility,discovery_started_at) values
 ('SEAT-NOTIFICATION','9e550000-0000-4000-8000-000000000001','live','public',now());
insert into public.paid_live_watch_party_offers(id,party_id,creator_id,host_user_id,pass_type,product_id,provider,
 provider_product_id,price_cents,currency,environment,status) values
 ('9e551000-0000-4000-8000-000000000001','SEAT-NOTIFICATION','9e550000-0000-4000-8000-000000000001',
 '9e550000-0000-4000-8000-000000000001','live_watch_party_seat_pass',
 (select id from public.monetization_products where product_key='live_watch_party_seat_pass_sandbox_099'),
 'revenuecat_google_play','cw_live_watch_party_seat_sandbox_099',99,'usd','sandbox','sandbox');
insert into public.provider_events(id,provider_event_id,provider,user_id,environment,event_type,status,idempotency_key) values
 ('9e552000-0000-4000-8000-000000000001','seat_notification_fixture','revenuecat_google_play',
 '9e550000-0000-4000-8000-000000000002','sandbox','INITIAL_PURCHASE','processed','seat_notification_fixture');
insert into public.access_grants(id,user_id,grant_type,source_type,source_id,provider,provider_event_id,environment,status) values
 ('9e553000-0000-4000-8000-000000000001','9e550000-0000-4000-8000-000000000002','live_watch_party_seat_pass','provider_event',
 '9e551000-0000-4000-8000-000000000001','revenuecat_google_play','9e552000-0000-4000-8000-000000000001','sandbox','sandbox_only');
insert into public.paid_live_watch_party_passes(id,offer_id,party_id,buyer_id,creator_id,pass_type,access_grant_id,provider_event_id) values
 ('9e554000-0000-4000-8000-000000000001','9e551000-0000-4000-8000-000000000001','SEAT-NOTIFICATION',
 '9e550000-0000-4000-8000-000000000002','9e550000-0000-4000-8000-000000000001','live_watch_party_seat_pass',
 '9e553000-0000-4000-8000-000000000001','9e552000-0000-4000-8000-000000000001');
select is((select count(*)::integer from public.notification_activity_events),0,'install and existing pass do not backfill seat alerts');
select has_trigger('public','notifications','notification_seat_to_activity_before_insert','exact interception is attached only in this rollback test');
select ok(not has_function_privilege('authenticated','private.seat_notification_source(text,uuid)','EXECUTE'),'seat state resolver is not a client read API');
select ok(not has_function_privilege('service_role','private.route_legacy_seat_notification_to_activity()','EXECUTE'),'interception helper cannot be directly called');
select ok(public.has_exact_live_watch_party_pass_internal('SEAT-NOTIFICATION','9e550000-0000-4000-8000-000000000002','live_watch_party_seat_pass'),
 'synthetic fixture satisfies the real existing paid-pass eligibility helper');
select set_config('request.jwt.claims','{"sub":"9e550000-0000-4000-8000-000000000002","role":"authenticated","session_id":"9e550000-0000-4000-8000-000000000102"}',true);
set local role authenticated;
select lives_ok($$select public.join_watch_party_room_session('SEAT-NOTIFICATION')$$,'actual current viewer joins as listener');
reset role;
savepoint disabled_worker;
set local role authenticated;
select is(public.request_my_live_watch_party_seat('SEAT-NOTIFICATION')->>'state','requested','default-disabled worker preserves actual request operation');
reset role;
select is((select count(*)::integer from public.notifications where source_type='live_watch_party_seat'),1,'default-disabled worker preserves the original bell row');
select is((select count(*)::integer from public.notification_activity_events),0,'default-disabled interception consumes no original notice');
rollback to disabled_worker;
-- Local rollback fixture only; this is not a worker activation operation.
insert into public.notification_activity_worker_config(singleton,enabled,token_sha256) values(true,true,repeat('a',64));
set local role authenticated;
select is(public.request_my_live_watch_party_seat('SEAT-NOTIFICATION')->>'state','requested','actual request RPC succeeds');
reset role;
select is((select count(*)::integer from public.notifications where source_type='live_watch_party_seat'),0,'legacy request row is intercepted rather than duplicated');
select is((select count(*)::integer from public.notification_activity_events where event_kind='live_watch_party_seat_requested'),1,'one exact request becomes durable work');
select is((select recipient_user_id::text from public.notification_activity_events where event_kind='live_watch_party_seat_requested'),
 '9e550000-0000-4000-8000-000000000001','request recipient is exact current room host');
set local role authenticated;
select is(public.request_my_live_watch_party_seat('SEAT-NOTIFICATION')->>'alreadyRequested','true','actual duplicate request remains idempotent');
reset role;
select is((select count(*)::integer from public.notification_activity_events where event_kind='live_watch_party_seat_requested'),1,'repeat RPC creates no additional work');
select is((select stage_role from public.watch_party_room_memberships where party_id='SEAT-NOTIFICATION'
 and user_id='9e550000-0000-4000-8000-000000000002'),'listener','request notification grants no speaking role');
create function pg_temp.seat_eligible(p_kind text) returns integer language sql as $$
 select count(*)::integer from public.notification_activity_events e where event_kind=p_kind
 and coalesce((private.resolve_notification_activity(e)->>'eligible')::boolean,false)
$$;
select is(pg_temp.seat_eligible('live_watch_party_seat_requested'),1,'exact current request resolves through common policy');
savepoint pending_request;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
update public.watch_party_room_memberships set left_at=now() where party_id='SEAT-NOTIFICATION'
 and user_id='9e550000-0000-4000-8000-000000000002';
reset role;
select is(pg_temp.seat_eligible('live_watch_party_seat_requested'),0,'left timestamp suppresses stale active or reconnecting membership');
rollback to pending_request;
savepoint pending_request;
update public.paid_live_watch_party_passes set requested_at=requested_at+interval '1 second' where id='9e554000-0000-4000-8000-000000000001';
select is(pg_temp.seat_eligible('live_watch_party_seat_requested'),0,'a new request revision cannot inherit old queued work');
rollback to pending_request;
savepoint pending_request;
update public.access_grants set revoked_at=now() where id='9e553000-0000-4000-8000-000000000001';
select is(pg_temp.seat_eligible('live_watch_party_seat_requested'),0,'grant revoked after request suppresses queued alert');
rollback to pending_request;
savepoint pending_request;
update public.access_grants set expires_at=now()-interval '1 second' where id='9e553000-0000-4000-8000-000000000001';
select is(pg_temp.seat_eligible('live_watch_party_seat_requested'),0,'expired exact grant suppresses queued seat work');
rollback to pending_request;
savepoint pending_request;
update public.paid_live_watch_party_passes set refunded_at=now() where id='9e554000-0000-4000-8000-000000000001';
select is(pg_temp.seat_eligible('live_watch_party_seat_requested'),0,'stale active pass with refund timestamp is not eligible');
rollback to pending_request;
savepoint pending_request;
update public.provider_events set status='failed' where id='9e552000-0000-4000-8000-000000000001';
select is(pg_temp.seat_eligible('live_watch_party_seat_requested'),0,'lost provider proof suppresses queued alert');
rollback to pending_request;
savepoint pending_request;
update public.paid_live_watch_party_offers set status='paused' where id='9e551000-0000-4000-8000-000000000001';
select is(pg_temp.seat_eligible('live_watch_party_seat_requested'),0,'disabled paid source suppresses queued alert');
rollback to pending_request;
savepoint pending_request;
insert into public.paid_live_watch_party_offers(id,party_id,creator_id,host_user_id,pass_type,product_id,provider,
 provider_product_id,price_cents,currency,environment,status) values
 ('9e551000-0000-4000-8000-000000000002','SEAT-NOTIFICATION','9e550000-0000-4000-8000-000000000001',
 '9e550000-0000-4000-8000-000000000001','live_watch_party_access_pass',
 (select id from public.monetization_products where product_key='live_watch_party_access_pass_sandbox_099'),
 'revenuecat_google_play','cw_live_watch_party_access_sandbox_099',99,'usd','sandbox','sandbox');
select is(pg_temp.seat_eligible('live_watch_party_seat_requested'),0,'new paid entry requirement needs its own current exact pass');
rollback to pending_request;
savepoint pending_request;
insert into public.channel_audience_blocks(channel_user_id,blocked_user_id,blocked_by_user_id) values
 ('9e550000-0000-4000-8000-000000000001','9e550000-0000-4000-8000-000000000002','9e550000-0000-4000-8000-000000000001');
select is(pg_temp.seat_eligible('live_watch_party_seat_requested'),0,'current recipient block suppresses requested notification');
rollback to pending_request;
savepoint pending_request;
insert into public.notification_preferences(user_id,seat_activity_enabled) values('9e550000-0000-4000-8000-000000000001',false);
select is(pg_temp.seat_eligible('live_watch_party_seat_requested'),0,'seat preference suppresses both presentation channels');
rollback to pending_request;
savepoint pending_request;
insert into public.notification_preferences(user_id,in_app_enabled,push_enabled) values('9e550000-0000-4000-8000-000000000001',false,true);
select ok((select (private.resolve_notification_activity(e)->>'push_allowed')::boolean
 and not (private.resolve_notification_activity(e)->>'in_app_allowed')::boolean
 from public.notification_activity_events e where event_kind='live_watch_party_seat_requested'),'push-only preference is preserved without a legacy bell bypass');
do $$ declare c jsonb; begin
 for c in select public.claim_notification_activity_batch(10) loop
  perform public.prepare_notification_activity((c->>'eventId')::uuid,(c->>'leaseToken')::uuid);
 end loop;
end $$;
select is((select count(*)::integer from public.notifications where notification_type='live_watch_party_seat_requested'),0,
 'actual push-only materialization creates no bell row');
rollback to pending_request;
savepoint pending_request;
insert into public.notification_preferences(user_id,in_app_enabled,push_enabled) values('9e550000-0000-4000-8000-000000000001',true,false);
select ok((select not (private.resolve_notification_activity(e)->>'push_allowed')::boolean
 and (private.resolve_notification_activity(e)->>'in_app_allowed')::boolean
 from public.notification_activity_events e where event_kind='live_watch_party_seat_requested'),'bell-only preference never enables ordinary push');
rollback to pending_request;
savepoint forged_recipient;
insert into public.notifications(user_id,actor_user_id,category,notification_type,title,body,target_route,target_entity_id,
 target_context,source_type,source_id) values('9e550000-0000-4000-8000-000000000003','9e550000-0000-4000-8000-000000000002',
 'creator_money_sale','live_watch_party_seat_requested','Wrong target','Wrong target','/watch-party/live-stage/[partyId]',
 'SEAT-NOTIFICATION','{"seat_state":"requested"}','live_watch_party_seat','9e551000-0000-4000-8000-000000000001');
select is((select count(*)::integer from public.notification_activity_events),1,'even privileged malformed legacy emission cannot choose a different recipient');
select is((select count(*)::integer from public.notifications),0,'invalid legacy target cannot bypass bell preferences');
rollback to forged_recipient;
-- Worker materialization is real, and calling it twice cannot recurse into interception.
do $$ declare c jsonb; begin
 for c in select public.claim_notification_activity_batch(10) loop
  perform public.prepare_notification_activity((c->>'eventId')::uuid,(c->>'leaseToken')::uuid);
  perform public.prepare_notification_activity((c->>'eventId')::uuid,(c->>'leaseToken')::uuid);
  perform public.finish_notification_activity((c->>'eventId')::uuid,(c->>'leaseToken')::uuid);
 end loop;
end $$;
select is((select count(*)::integer from public.notifications where notification_type='live_watch_party_seat_requested'),1,'common materializer writes exactly one requested bell row');
select is((select source_type from public.notifications where notification_type='live_watch_party_seat_requested'),'notification_activity','materialized rows bypass legacy interception');
select set_config('request.jwt.claims','{"sub":"9e550000-0000-4000-8000-000000000003","role":"authenticated","session_id":"9e550000-0000-4000-8000-000000000103"}',true);
set local role authenticated;
select throws_ok($$select public.review_live_watch_party_seat_request('SEAT-NOTIFICATION','9e550000-0000-4000-8000-000000000002','reject')$$,
 'P0001','exact_live_stage_host_required','other account cannot generate host decision');
select set_config('request.jwt.claims','{"sub":"9e550000-0000-4000-8000-000000000001","role":"authenticated","session_id":"9e550000-0000-4000-8000-000000000101"}',true);
select is(public.review_live_watch_party_seat_request('SEAT-NOTIFICATION','9e550000-0000-4000-8000-000000000002','reject')->>'state','rejected','actual host reject RPC succeeds');
reset role;
select is(pg_temp.seat_eligible('live_watch_party_seat_requested'),0,'late request cannot remain actionable after host rejection');
select is(pg_temp.seat_eligible('live_watch_party_seat_rejected'),1,'current rejection has one eligible exact recipient event');
select is((select recipient_user_id::text from public.notification_activity_events where event_kind='live_watch_party_seat_rejected'),
 '9e550000-0000-4000-8000-000000000002','rejection recipient is exact eligible buyer');
select is((select count(*)::integer from public.notifications where source_type='live_watch_party_seat'),0,'rejection never writes a duplicate legacy bell row');
set local role authenticated;
select lives_ok($$select public.set_watch_party_participant_authority('SEAT-NOTIFICATION','9e550000-0000-4000-8000-000000000002','speaker')$$,
 'actual exact host approval uses original paid speaker authority');
reset role;
select is(pg_temp.seat_eligible('live_watch_party_seat_rejected'),0,'superseded rejection cannot be delivered');
select is(pg_temp.seat_eligible('live_watch_party_seat_approved'),1,'actual speaker approval emits one current exact notification event');
select is((select recipient_user_id::text from public.notification_activity_events where event_kind='live_watch_party_seat_approved'),
 '9e550000-0000-4000-8000-000000000002','approval recipient is exact eligible buyer');
set local role authenticated;
select lives_ok($$select public.set_watch_party_participant_authority('SEAT-NOTIFICATION','9e550000-0000-4000-8000-000000000002','speaker')$$,
 'repeat approval preserves original role operation');
reset role;
select is((select count(*)::integer from public.notification_activity_events where event_kind='live_watch_party_seat_approved'),1,'repeat approval does not duplicate alert');
savepoint approved_seat;
set local role authenticated;
select lives_ok($$select public.set_watch_party_participant_authority('SEAT-NOTIFICATION','9e550000-0000-4000-8000-000000000002','listener')$$,
 'original host may remove current speaker status');
reset role;
select is(pg_temp.seat_eligible('live_watch_party_seat_approved'),0,'current role loss suppresses stale approval notification');
rollback to approved_seat;
savepoint approved_seat;
update public.watch_party_rooms set is_active=false where party_id='SEAT-NOTIFICATION';
select is(pg_temp.seat_eligible('live_watch_party_seat_approved'),0,'ended Stage suppresses queued approval');
rollback to approved_seat;
select ok(not exists(select 1 from public.notification_activity_events where context::text ~ '(https:|source.mp4|access_grant)'),
 'notification context contains no protected playback or access grant');
select ok((select bool_and(expires_at=created_at+interval '24 hours') from public.notification_activity_events),'all seat work has a finite delivery horizon');
select * from finish();
rollback;
