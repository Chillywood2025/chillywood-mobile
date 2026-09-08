begin;

create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

select has_column('public','watch_party_rooms','discovery_visibility',
  'Live Stage rooms persist an authoritative discovery audience');
select has_column('public','creator_events','visibility',
  'creator Events persist an authoritative audience');
select has_function('public','can_read_creator_event',array['uuid','uuid'],
  'Event visibility has one server-side resolver');
select has_function('public','publish_live_stage_discovery',array['text','uuid'],
  'connected Live Stages have a server-only publication transition');
select has_function('public','sync_spectator_broadcast_discovery',array['uuid'],
  'provider-approved spectator broadcasts have a canonical producer');
select has_function('public','read_authorized_event_reminder_recipients',array['uuid'],
  'Event reminders resolve recipients through Event authority');
select ok(not has_function_privilege(
  'anon','public.can_read_circle_spectator_feed_item(uuid,text)','EXECUTE'
), 'anonymous clients cannot invoke Circle discovery authority');

select ok(has_function_privilege('service_role','public.publish_live_stage_discovery(text,uuid)','EXECUTE'),
  'the service role can publish an exact connected Live Stage');
select ok(not has_function_privilege('anon','public.publish_live_stage_discovery(text,uuid)','EXECUTE'),
  'anonymous clients cannot publish a Live Stage');
select ok(not has_function_privilege('authenticated','public.publish_live_stage_discovery(text,uuid)','EXECUTE'),
  'authenticated clients cannot publish a Live Stage');
select ok(has_function_privilege('service_role','public.read_authorized_event_reminder_recipients(uuid)','EXECUTE'),
  'the notification service can enumerate authorized Event reminders');
select ok(not has_function_privilege('anon','public.read_authorized_event_reminder_recipients(uuid)','EXECUTE'),
  'anonymous clients cannot enumerate Event reminder recipients');
select ok(not has_function_privilege('authenticated','public.read_authorized_event_reminder_recipients(uuid)','EXECUTE'),
  'authenticated clients cannot enumerate Event reminder recipients');
select ok(
  not has_table_privilege('authenticated','public.discovery_feed_items','INSERT')
  and not has_table_privilege('authenticated','public.discovery_feed_items','UPDATE')
  and not has_table_privilege('authenticated','public.discovery_feed_items','DELETE')
  and not has_table_privilege('authenticated','public.circle_spectator_feed_items','INSERT')
  and not has_table_privilege('authenticated','public.circle_spectator_feed_items','UPDATE')
  and not has_table_privilege('authenticated','public.circle_spectator_feed_items','DELETE'),
  'authenticated clients cannot fabricate authoritative discovery rows'
);
select has_trigger('public','creator_events','sync_creator_event_discovery_after_write',
  'Event lifecycle writes update canonical discovery');
select has_trigger('public','paid_creator_events','sync_paid_creator_event_discovery_after_write',
  'Event offer lifecycle writes update canonical access discovery');
select has_trigger('public','watch_party_rooms','sync_live_stage_discovery_after_write',
  'Live Stage lifecycle writes update canonical discovery');
select has_trigger('public','room_broadcast_sessions','sync_spectator_broadcast_discovery_after_write',
  'broadcast lifecycle writes update canonical discovery');
select has_trigger('public','spectator_hls_playback_records','sync_spectator_playback_discovery_after_write',
  'spectator playback lifecycle writes update canonical discovery');

select ok(
  position('p_viewer_user_id is distinct from auth.uid()' in lower(pg_get_functiondef(
    'public.can_read_creator_event(uuid,uuid)'::regprocedure
  ))) > 0,
  'client callers cannot select another viewer identity for Event access'
);
select ok(
  position('d7f_public_safe_approved' in pg_get_functiondef(
    'public.sync_spectator_broadcast_discovery_pre_fixture_quarantine(uuid)'::regprocedure
  )) > 0
  and position('circle_spectator_approved' in pg_get_functiondef(
    'public.sync_spectator_broadcast_discovery_pre_fixture_quarantine(uuid)'::regprocedure
  )) > 0,
  'ordinary invite/code Watch-Parties cannot enter discovery without provider-safe publication evidence'
);

set local session_replication_role=replica;
insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at) values
  ('a1000000-0000-4000-8000-000000000001',false,false,timezone('utc'::text,now())),
  ('b2000000-0000-4000-8000-000000000002',false,false,timezone('utc'::text,now())),
  ('c3000000-0000-4000-8000-000000000003',false,false,timezone('utc'::text,now())),
  ('d4000000-0000-4000-8000-000000000004',false,false,timezone('utc'::text,now()))
on conflict (id) do nothing;
set local session_replication_role=origin;

insert into public.user_friendships(
  user_low_id,user_high_id,requested_by_user_id,status,responded_at,actioned_by_user_id
) values (
  'a1000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000002',
  'b2000000-0000-4000-8000-000000000002','active',timezone('utc'::text,now()),
  'a1000000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000001"}',true);
set local role authenticated;
select lives_ok(
  $$insert into public.creator_events(
      id,host_user_id,event_title,event_type,status,starts_at,ends_at,visibility,reminder_ready
    ) values (
      'ef000000-0000-4000-8000-000000000009','a1000000-0000-4000-8000-000000000001',
      'Authenticated host future Event','live_first','scheduled',
      now()+interval '6 hours',now()+interval '7 hours','public',false
    ) returning id,event_title,status,visibility$$,
  'an authenticated host can create an Event through the app INSERT ... RETURNING contract'
);
select lives_ok(
  $$update public.creator_events
    set starts_at=now()+interval '8 hours',ends_at=now()+interval '9 hours'
    where id='ef000000-0000-4000-8000-000000000009'
    returning id,starts_at,ends_at$$,
  'the owning host can reschedule through the app UPDATE ... RETURNING contract'
);
reset role;
select is((select count(*)::integer from public.discovery_feed_items
  where source_type='creator_event' and source_id='ef000000-0000-4000-8000-000000000009'
    and live_state='scheduled' and is_publicly_discoverable),1,
  'authenticated host creation and reschedule retain one canonical Upcoming projection');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"c3000000-0000-4000-8000-000000000003"}',true);
set local role authenticated;
select throws_like(
  $$insert into public.creator_events(
      host_user_id,event_title,event_type,status,starts_at,ends_at,visibility,reminder_ready
    ) values (
      'a1000000-0000-4000-8000-000000000001','Wrong-host Event','live_first','scheduled',
      now()+interval '6 hours',now()+interval '7 hours','public',false
    ) returning id$$,
  '%row-level security policy%',
  'an authenticated user cannot create an Event for another host'
);
reset role;

select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);

insert into public.creator_events(
  id,host_user_id,event_title,event_type,status,starts_at,ends_at,visibility,reminder_ready
) values
  ('e1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
   'Public future Event','live_first','scheduled',now()+interval '2 hours',now()+interval '3 hours','public',true),
  ('e2000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001',
   'Circle future Event','live_first','scheduled',now()+interval '2 hours',now()+interval '3 hours','circle',true),
  ('e3000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000001',
   'Private future Event','live_first','scheduled',now()+interval '2 hours',now()+interval '3 hours','private',true),
  ('e4000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000001',
   'Public draft Event','live_first','draft',null,null,'public',false);

select ok(public.can_read_creator_event(
  'e1000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000003'),
  'a public non-draft Event is readable by another user');
select ok(public.can_read_creator_event(
  'e2000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000002'),
  'a Circle Event is readable by a current Circle member');
select ok(not public.can_read_creator_event(
  'e2000000-0000-4000-8000-000000000002','c3000000-0000-4000-8000-000000000003'),
  'a Circle Event is denied to a non-member');
select ok(not public.can_read_creator_event(
  'e3000000-0000-4000-8000-000000000003','c3000000-0000-4000-8000-000000000003'),
  'a private Event is denied without exact authority');
select ok(not public.can_read_creator_event(
  'e4000000-0000-4000-8000-000000000004','c3000000-0000-4000-8000-000000000003'),
  'a public-labelled draft remains creator-only');

insert into public.paid_creator_events(
  id,creator_event_id,creator_id,title,event_type,starts_at,ends_at,price_cents,
  currency,status,provider,provider_product_key,provider_product_id,metadata
) values (
  'e5000000-0000-4000-8000-000000000005','e3000000-0000-4000-8000-000000000003',
  'a1000000-0000-4000-8000-000000000001','Private paid Event','live_first',
  now()+interval '2 hours',now()+interval '3 hours',499,'usd','sandbox','revenuecat',
  'event_pass','chillywood_event_pass_private_test',jsonb_build_object('sandbox',true)
);
insert into public.paid_creator_event_passes(
  id,event_id,creator_event_id,buyer_id,creator_id,provider,status,expires_at,metadata
) values (
  'e6000000-0000-4000-8000-000000000006','e5000000-0000-4000-8000-000000000005',
  'e3000000-0000-4000-8000-000000000003','d4000000-0000-4000-8000-000000000004',
  'a1000000-0000-4000-8000-000000000001','revenuecat','active',now()+interval '3 hours',
  jsonb_build_object('synthetic_local_test',true)
);
select ok(public.can_read_creator_event(
  'e3000000-0000-4000-8000-000000000003','d4000000-0000-4000-8000-000000000004'),
  'an exact active Event Pass grants only its private Event authority');
select ok(not public.can_read_creator_event(
  'e2000000-0000-4000-8000-000000000002','d4000000-0000-4000-8000-000000000004'),
  'an Event Pass never grants another Event or Circle authority');
update public.paid_creator_event_passes set status='refunded',refunded_at=now()
where id='e6000000-0000-4000-8000-000000000006';
select ok(not public.can_read_creator_event(
  'e3000000-0000-4000-8000-000000000003','d4000000-0000-4000-8000-000000000004'),
  'a refunded Event Pass immediately loses private Event authority');

select is((select count(*)::integer from public.discovery_feed_items
  where source_type='creator_event' and source_id='e1000000-0000-4000-8000-000000000001'
    and is_publicly_discoverable and live_state='scheduled'),1,
  'a future public Event appears in canonical Upcoming discovery');
select ok((select access_type='public_free' and not requires_ticket_to_watch
  from public.discovery_feed_items
  where source_type='creator_event' and source_id='e1000000-0000-4000-8000-000000000001'),
  'a free public Event has no Event Pass gate');
select is((select count(*)::integer from public.circle_spectator_feed_items
  where source_type='creator_event' and source_id='e2000000-0000-4000-8000-000000000002'
    and status='active' and live_state='scheduled'),1,
  'a future Circle Event appears only in the Circle projection');
select is((select count(*)::integer from public.discovery_feed_items
  where source_type='creator_event' and source_id in (
    'e2000000-0000-4000-8000-000000000002','e3000000-0000-4000-8000-000000000003',
    'e4000000-0000-4000-8000-000000000004')),0,
  'Circle, private, and draft Events do not leak into public discovery');

insert into public.creator_events(
  id,host_user_id,event_title,event_type,status,starts_at,ends_at,visibility,reminder_ready
) values (
  'e7000000-0000-4000-8000-000000000007','a1000000-0000-4000-8000-000000000001',
  'Public paid Event','live_first','scheduled',now()+interval '4 hours',now()+interval '5 hours','public',true
);
insert into public.paid_creator_events(
  id,creator_event_id,creator_id,title,event_type,starts_at,ends_at,price_cents,
  currency,status,provider,provider_product_key,provider_product_id,metadata
) values (
  'e8000000-0000-4000-8000-000000000008','e7000000-0000-4000-8000-000000000007',
  'a1000000-0000-4000-8000-000000000001','Public paid Event','live_first',
  now()+interval '4 hours',now()+interval '5 hours',799,'usd','sandbox','revenuecat',
  'event_pass','chillywood_event_pass_public_test',jsonb_build_object('sandbox',true)
);
select ok((select access_type='ticketed' and requires_ticket_to_watch
  and source_type='creator_event' and source_id='e7000000-0000-4000-8000-000000000007'
  from public.discovery_feed_items
  where source_type='creator_event' and source_id='e7000000-0000-4000-8000-000000000007'),
  'a paid public Event remains exact Event discovery and requires its Event Pass');

update public.creator_events set status='live_now'
where id='e1000000-0000-4000-8000-000000000001';
select is((select live_state from public.discovery_feed_items
  where source_type='creator_event' and source_id='e1000000-0000-4000-8000-000000000001'),
  'live','starting an Event updates the same authoritative discovery item');

update public.creator_events set status='ended'
where id='e1000000-0000-4000-8000-000000000001';
select ok((select not is_publicly_discoverable and live_state='live'
  and moderation_status='hidden' from public.discovery_feed_items
  where source_type='creator_event' and source_id='e1000000-0000-4000-8000-000000000001'),
  'ending an Event removes it from active discovery even when historical state is retained');

insert into public.watch_party_rooms(
  party_id,host_user_id,room_type,is_active,discovery_visibility,discovery_title
) values (
  'RFGC-PUBLIC-LIVE','a1000000-0000-4000-8000-000000000001','live',true,'public','Public Live proof'
);
select ok(not public.publish_live_stage_discovery(
  'RFGC-PUBLIC-LIVE','c3000000-0000-4000-8000-000000000003'),
  'a non-host cannot publish another creator Live');
select ok(public.publish_live_stage_discovery(
  'RFGC-PUBLIC-LIVE','a1000000-0000-4000-8000-000000000001'),
  'the exact host can publish the exact active connected Live');
select is((select count(*)::integer from public.discovery_feed_items
  where source_type='live_stage_room' and source_id='RFGC-PUBLIC-LIVE'
    and live_state='live' and is_publicly_discoverable),1,
  'a started public Live has one canonical discovery item');

update public.watch_party_rooms set is_active=false where party_id='RFGC-PUBLIC-LIVE';
select ok((select live_state='ended' and not is_publicly_discoverable
  and moderation_status='hidden' from public.discovery_feed_items
  where source_type='live_stage_room' and source_id='RFGC-PUBLIC-LIVE'),
  'ending a public Live retires its exact discovery item');

insert into public.room_broadcast_sessions(
  id,source_type,source_room_id,host_user_id,channel_user_id,broadcast_status,
  egress_provider,egress_status,hls_playback_url,playback_url_status,rights_status,
  access_type,ad_policy,is_publicly_watchable,is_spectator_playback_enabled,
  requires_premium,requires_ticket,cost_guard_status,started_at,metadata
) values (
  'f1000000-0000-4000-8000-000000000001','watch_party_room','RFGC-SPECTATOR-WP',
  'a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
  'active_later','manual_foundation','active_later','https://example.invalid/rfgc.m3u8',
  'public_safe_available','creator_owned','public_free','no_ads',true,true,false,false,
  'foundation',timezone('utc'::text,now()),
  jsonb_build_object('d7f_public_safe_approved',true,'title','Canonical public Watch-Party proof')
);
insert into public.spectator_hls_playback_records(
  id,broadcast_session_id,source_room_id,host_user_id,channel_user_id,visibility,
  playback_status,playlist_path,rights_status,access_type,is_publicly_watchable,
  is_spectator_playback_enabled,requires_premium,requires_ticket,metadata
) values (
  'f2000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000001',
  'RFGC-SPECTATOR-WP','a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001','public','live','rfgc/index.m3u8',
  'creator_owned','public_free',true,true,false,false,jsonb_build_object('d7f_public_safe_gate',true)
);
select is((select count(*)::integer from public.discovery_feed_items
  where source_type='watch_party_room' and source_id='RFGC-SPECTATOR-WP'
    and metadata->>'producer'='canonical_spectator_broadcast_v1'
    and live_state='live' and is_publicly_discoverable),1,
  'provider-approved public-safe Watch-Party playback has one canonical discovery item');

insert into public.watch_party_rooms(
  party_id,host_user_id,room_type,is_active,discovery_visibility,discovery_title
) values (
  'RFGC-SPECTATOR-WP','a1000000-0000-4000-8000-000000000001','live',true,'public','Exact Live Stage source'
);
select ok(public.publish_live_stage_discovery(
  'RFGC-SPECTATOR-WP','a1000000-0000-4000-8000-000000000001'),
  'the exact Live Stage can publish even when a spectator source uses the same canonical room id');
select is((select count(*)::integer from public.discovery_feed_items
  where source_id='RFGC-SPECTATOR-WP' and is_publicly_discoverable),2,
  'Live Stage and spectator Watch-Party projections cannot overwrite or route across source classes');
update public.watch_party_rooms set is_active=false where party_id='RFGC-SPECTATOR-WP';

update public.spectator_hls_playback_records set playback_status='ended'
where id='f2000000-0000-4000-8000-000000000002';
select ok((select not is_publicly_discoverable and moderation_status='hidden'
  from public.discovery_feed_items
  where source_type='watch_party_room' and source_id='RFGC-SPECTATOR-WP'),
  'ended spectator playback cannot remain publicly discoverable');

update public.spectator_hls_playback_records
set visibility='circle',playback_status='live',access_type='circle',
    is_publicly_watchable=false,is_spectator_playback_enabled=true,
    updated_at=timezone('utc'::text,now())
where id='f2000000-0000-4000-8000-000000000002';
update public.room_broadcast_sessions
set playback_url_status='circle_safe_available',access_type='circle',
    is_publicly_watchable=false,is_spectator_playback_enabled=true,
    metadata=metadata || jsonb_build_object('circle_spectator_approved',true),
    updated_at=timezone('utc'::text,now())
where id='f1000000-0000-4000-8000-000000000001';
select is((select count(*)::integer from public.circle_spectator_feed_items
  where source_type='watch_party_room' and source_id='RFGC-SPECTATOR-WP'
    and metadata->>'producer'='canonical_spectator_broadcast_v1'
    and live_state='live' and status='active'),1,
  'provider-approved Circle-safe Watch-Party playback has one Circle projection');
select ok((select not is_publicly_discoverable and moderation_status='hidden'
  from public.discovery_feed_items
  where source_type='watch_party_room' and source_id='RFGC-SPECTATOR-WP'),
  'moving a spectator-safe Watch-Party to Circle retires its public projection');

update public.room_broadcast_sessions
set metadata=metadata || jsonb_build_object('proof_fixture',true),
    updated_at=timezone('utc'::text,now())
where id='f1000000-0000-4000-8000-000000000001';
select ok((select status='hidden' and moderation_status='hidden'
    and not is_spectator_enabled and not allow_spectator_view
    and metadata->>'release_quarantine'='pre_activation_fixture_producer_quarantine_v1'
  from public.circle_spectator_feed_items
  where source_type='watch_party_room' and source_id='RFGC-SPECTATOR-WP'),
  'a proof-marked provider source is quarantined instead of republished into Circle discovery');

update public.room_broadcast_sessions
set metadata=metadata - 'proof_fixture',updated_at=timezone('utc'::text,now())
where id='f1000000-0000-4000-8000-000000000001';
select ok((select status='active' and moderation_status='clean'
    and is_spectator_enabled and allow_spectator_view
  from public.circle_spectator_feed_items
  where source_type='watch_party_room' and source_id='RFGC-SPECTATOR-WP'),
  'removing the fixture marker re-enables only the otherwise valid authoritative provider source');

insert into public.watch_party_rooms(
  party_id,host_user_id,room_type,is_active,discovery_visibility,discovery_title
) values (
  'RFGC-CIRCLE-LIVE','a1000000-0000-4000-8000-000000000001','live',true,'circle','Circle Live proof'
);
select ok(public.publish_live_stage_discovery(
  'RFGC-CIRCLE-LIVE','a1000000-0000-4000-8000-000000000001'),
  'the exact host can publish a Circle Live');
select is((select count(*)::integer from public.circle_spectator_feed_items
  where source_type='live_stage_room' and source_id='RFGC-CIRCLE-LIVE'
    and live_state='live' and status='active'),1,
  'a started Circle Live has one Circle-only discovery item');
select is((select count(*)::integer from public.discovery_feed_items
  where source_id='RFGC-CIRCLE-LIVE'),0,
  'a Circle Live has no public discovery item');
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000001"}',true);
set local role authenticated;
select throws_ok(
  $$update public.watch_party_rooms
    set discovery_started_at=timezone('utc'::text,now()) + interval '1 second'
    where party_id='RFGC-CIRCLE-LIVE'$$,
  'P0001',
  'live_stage_discovery_start_authority_required',
  'an authenticated host cannot fabricate the provider-confirmed discovery start boundary'
);
reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select ok(coalesce((public.resolve_watch_party_livekit_viewer_authority(
  'RFGC-CIRCLE-LIVE','b2000000-0000-4000-8000-000000000002',null
)->>'allowed')::boolean,false),
  'the authorized Circle member retains exact LiveKit viewer authority');
select ok(not coalesce((public.resolve_watch_party_livekit_viewer_authority(
  'RFGC-CIRCLE-LIVE','c3000000-0000-4000-8000-000000000003',null
)->>'allowed')::boolean,false),
  'an unrelated user cannot use a guessed Circle Live id for LiveKit authority');
reset role;

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"b2000000-0000-4000-8000-000000000002"}',true);
set local role authenticated;
select is((select count(*)::integer from public.creator_events
  where id in (
    'e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000002',
    'e3000000-0000-4000-8000-000000000003','e4000000-0000-4000-8000-000000000004'
  )),2,
  'Event RLS exposes public plus exact Circle rows, but no private or draft rows, to a Circle member');
select is((select count(*)::integer from public.circle_spectator_feed_items
  where source_type='live_stage_room' and source_id='RFGC-CIRCLE-LIVE'),1,
  'the authorized Circle member can read the Circle Live projection');
select is((select count(*)::integer from public.circle_spectator_feed_items
  where source_type='watch_party_room' and source_id='RFGC-SPECTATOR-WP'),1,
  'the authorized Circle member can read the Circle Watch-Party projection');

reset role;
insert into public.channel_audience_blocks(
  channel_user_id,blocked_user_id,blocked_by_user_id,reason
) values (
  'a1000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000001',
  'pre-activation Circle authority negative control'
);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"b2000000-0000-4000-8000-000000000002"}',true);
set local role authenticated;
select ok(not public.can_read_creator_event(
  'e2000000-0000-4000-8000-000000000002',
  'b2000000-0000-4000-8000-000000000002'
), 'a current Circle block revokes Event authority without a stale relationship grant');
select is((select count(*)::integer from public.circle_spectator_feed_items
  where source_id in ('RFGC-CIRCLE-LIVE','RFGC-SPECTATOR-WP')),0,
  'a blocked Circle member cannot read Circle Live or Watch-Party discovery');
reset role;
delete from public.channel_audience_blocks
where channel_user_id='a1000000-0000-4000-8000-000000000001'
  and blocked_user_id='b2000000-0000-4000-8000-000000000002';

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"c3000000-0000-4000-8000-000000000003"}',true);
set local role authenticated;
select is((select count(*)::integer from public.creator_events
  where id in (
    'e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000002',
    'e3000000-0000-4000-8000-000000000003','e4000000-0000-4000-8000-000000000004'
  )),1,
  'Event RLS exposes only non-draft public rows to an unrelated authenticated user');
select is((select count(*)::integer from public.circle_spectator_feed_items
  where source_type='live_stage_room' and source_id='RFGC-CIRCLE-LIVE'),0,
  'an unrelated user cannot read the Circle Live projection');
select is((select count(*)::integer from public.circle_spectator_feed_items
  where source_type='watch_party_room' and source_id='RFGC-SPECTATOR-WP'),0,
  'an unrelated user cannot read the Circle Watch-Party projection');
select ok(not public.can_read_creator_event(
  'e1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000002'),
  'an authenticated caller cannot select another viewer identity');

reset role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.watch_party_rooms set is_active=false where party_id='RFGC-CIRCLE-LIVE';
select ok((select live_state='ended' and status='hidden'
  from public.circle_spectator_feed_items
  where source_type='live_stage_room' and source_id='RFGC-CIRCLE-LIVE'),
  'ending a Circle Live retires its exact Circle discovery item');

update public.room_broadcast_sessions
set broadcast_status='ended',ended_at=timezone('utc'::text,now()),updated_at=timezone('utc'::text,now())
where id='f1000000-0000-4000-8000-000000000001';
select ok((select live_state='ended' and status='hidden'
  from public.circle_spectator_feed_items
  where source_type='watch_party_room' and source_id='RFGC-SPECTATOR-WP'),
  'ending a Circle Watch-Party retires its exact Circle projection');

update public.room_broadcast_sessions
set metadata=metadata || jsonb_build_object('title','QA fixture remains excluded'),
    updated_at=timezone('utc'::text,now())
where id='048a879b-7174-450e-a6cc-0b1758ec4879';
select is((select count(*)::integer from public.discovery_feed_items
  where source_type='watch_party_room' and source_id='spectator_fixture_content_20260526'
    and metadata->>'producer'='canonical_spectator_broadcast_v1'),0,
  'a positively identified QA broadcast cannot re-enter canonical discovery');

select is((select count(*)::integer from public.discovery_feed_items
  where coalesce(metadata->>'spectator_child_room_fixture','')='true'
    and is_publicly_discoverable),0,
  'positively identified QA fixtures are quarantined from public discovery');
select is((select count(*)::integer from public.circle_spectator_feed_items
  where coalesce(metadata->>'proof_fixture','')='true' and status='active'),0,
  'positively identified Circle proof fixtures are quarantined');

select ok(
  position('v_event."starts_at" <= v_now' in pg_get_functiondef(
    'public.sync_creator_event_discovery(uuid)'::regprocedure
  )) > 0
  and position('v_event."ends_at" <= v_now' in pg_get_functiondef(
    'public.sync_creator_event_discovery(uuid)'::regprocedure
  )) > 0,
  'the canonical Event producer rejects past scheduled and ended live authority'
);
select ok(
  position('media_scan_public_safe' in pg_get_functiondef(
    'public.sync_creator_video_feed_items(text)'::regprocedure
  )) > 0
  and position('v_video."quarantined_at" is null' in lower(pg_get_functiondef(
    'public.sync_creator_video_feed_items_trigger()'::regprocedure
  ))) > 0,
  'creator-video fanout requires current scan and quarantine authority'
);
select ok(
  position('media_scan_public_safe' in pg_get_functiondef(
    'public.can_read_creator_feed_item(text,text,text,text,text,text,text)'::regprocedure
  )) > 0
  and position('v_video."quarantined_at" is not null' in lower(pg_get_functiondef(
    'public.can_read_creator_feed_item(text,text,text,text,text,text,text)'::regprocedure
  ))) > 0,
  'relationship feed reads fail closed for unsafe video sources even for the creator'
);
select ok(
  (
    select bool_and(qual like '%starts_at%now()%')
    from pg_policies
    where schemaname='public'
      and tablename='discovery_feed_items'
      and policyname in (
        'discovery_feed_items_select_public_safe_authenticated',
        'discovery_feed_items_select_spectator_public_safe_anon'
      )
  ),
  'public discovery RLS independently enforces the scheduled time boundary'
);

insert into public.creator_events(
  id,host_user_id,event_title,event_type,status,starts_at,ends_at,visibility,reminder_ready
) values (
  'e8000000-0000-4000-8000-000000000008',
  'a1000000-0000-4000-8000-000000000001',
  'Past scheduled negative control','live_first','scheduled',
  now()-interval '2 hours',now()-interval '1 hour','public',false
);
select is((select count(*)::integer from public.discovery_feed_items
  where source_type='creator_event'
    and source_id='e8000000-0000-4000-8000-000000000008'
    and is_publicly_discoverable),0,
  'a past scheduled Event cannot be produced as Upcoming discovery');

insert into public.videos(
  id,owner_id,title,visibility,moderation_status,scan_status,
  storage_provider,storage_bucket,storage_object_key,storage_path,
  mime_type,file_size_bytes
) values (
  'e9000000-0000-4000-8000-000000000009',
  'a1000000-0000-4000-8000-000000000001',
  'Relationship feed scan lifecycle control','public','clean','clean',
  'cloudflare_r2','chillywood-media-origin',
  'a1000000-0000-4000-8000-000000000001/e9000000-0000-4000-8000-000000000009/source.mp4',
  'a1000000-0000-4000-8000-000000000001/e9000000-0000-4000-8000-000000000009/source.mp4',
  'video/mp4',1024
);
select is((select count(*)::integer from public.creator_feed_items
  where source_type='creator_video'
    and source_id='e9000000-0000-4000-8000-000000000009'
    and status='active'),0,
  'a newly uploaded video remains absent while its authoritative scan is pending');

update public.videos
set scan_status='clean',scanned_at=timezone('utc'::text,now())
where id='e9000000-0000-4000-8000-000000000009';
select is((select count(*)::integer from public.creator_feed_items
  where source_type='creator_video'
    and source_id='e9000000-0000-4000-8000-000000000009'
    and status='active'),2,
  'an authoritatively clean public video creates its follower and Circle fanout rows');

update public.videos
set scan_status='quarantined',quarantined_at=now(),updated_at=now()
where id='e9000000-0000-4000-8000-000000000009';
select is((select count(*)::integer from public.creator_feed_items
  where source_type='creator_video'
    and source_id='e9000000-0000-4000-8000-000000000009'
    and status='active'),0,
  'quarantine immediately retires every relationship fanout row');

update public.creator_feed_items
set status='active'
where source_type='creator_video'
  and source_id='e9000000-0000-4000-8000-000000000009';
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000001"}',true);
set local role authenticated;
select ok(not public.can_read_creator_feed_item(
  'creator_video','e9000000-0000-4000-8000-000000000009',
  'a1000000-0000-4000-8000-000000000001','public','followers','active',
  'a1000000-0000-4000-8000-000000000001'
), 'creator ownership cannot make a quarantined video release-discoverable');
reset role;

select * from finish();
rollback;
