-- Disposable full-schema fixture only. Actual purchase, host, producer receipt,
-- lifecycle and playback RPCs; provider transport and qualification are synthetic.
create table event_reservation_fixture.replay_deadline_context(context jsonb not null);
do $$
declare host event_reservation_fixture.actors;buyer event_reservation_fixture.actors;premium public.monetization_products;
  event uuid:=gen_random_uuid();offer jsonb;intent jsonb;receipt jsonb;prepared jsonb;source jsonb;server uuid;
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  insert into event_reservation_fixture.actors
  select creator_id,md5('replay-deadline-session:'||creator_id::text)::uuid,'replay_deadline_creator'
  from(select md5('replay-deadline-creator:'||n::text)::uuid creator_id from generate_series(1,1000)n)candidates
  where mod(hashtextextended('chillywood-wave1-us-rollout-v1:'||creator_id::text,20260814),100)=0 limit 1;
  select * into host from event_reservation_fixture.actors where kind='replay_deadline_creator';
  select * into buyer from event_reservation_fixture.actors where kind='buyer17';
  insert into auth.users(id,is_sso_user,is_anonymous,email,email_confirmed_at) values(host.user_id,false,false,'replay-deadline@example.test',now());
  insert into auth.sessions(id,user_id) values(host.session_id,host.user_id);
  insert into public.sandbox_monetization_testers(user_id,status,note) values(host.user_id::text,'active','Synthetic replay deadline fixture');
  insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
  select host.user_id,public.wave1_sha256(host.user_id::text),d.document_key,d.version,d.market,'member',d.capability,host.session_id::text,'service_reconciliation'
  from public.wave1_legal_document_versions d where d.active and d.market='UNITED_STATES' and d.capability in('account','creator','creator_money');
  perform public.wave1_evaluate_creator_eligibility(host.user_id,jsonb_build_object('accountStatus','ACTIVE','age18Plus',true,'legalAccepted',true,
    'creatorRole',true,'moderationState','CLEAR','market','UNITED_STATES','rolloutEligible',false,'platformCapability',true,'providerEligible',true,
    'kycComplete',true,'taxComplete',true,'sanctionsClear',true,'payoutEligible',true,'inputVersions',jsonb_build_object('evaluationSequence',1)),
    'replay-deadline-synthetic','local_pgtap');
  select * into premium from public.monetization_products where product_type='premium_subscription' and provider='revenuecat_google_play'
    and environment='sandbox' order by id limit 1;
  receipt:=public.process_revenuecat_premium_event_atomic('revenuecat_google_play','replay-deadline-host-premium','INITIAL_PURCHASE',host.user_id,
    premium.provider_product_id,premium.provider_base_plan_id,'sandbox','active',now()-interval '1 minute',now()+interval '1 day',now(),999,'usd',
    repeat('c',64),'NORMAL','google_play','android',null,premium.id,'replay-deadline-host-original');
  if receipt->>'status'<>'processed' then raise exception 'replay fixture Premium failed: %',receipt; end if;
  insert into public.creator_events(id,host_user_id,event_title,event_type,visibility,status,starts_at,ends_at,time_zone,replay_policy,replay_available_at,replay_expires_at)
  values(event,host.user_id,'Replay deadline fixture','live_first','public','scheduled',clock_timestamp()-interval '2 minutes',clock_timestamp()+interval '1 hour',
    'America/New_York','until_expiration',clock_timestamp()+interval '2 hours',clock_timestamp()+interval '1 day');
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',host.user_id,'session_id',host.session_id)::text,true);
  offer:=public.configure_paid_creator_event_sale(event,'Live show and explicit replay window',99,5,'sandbox','America/New_York',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '30 minutes');
  perform set_config('request.headers','{"x-chillywood-platform":"ios"}',true);
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',buyer.user_id,'session_id',buyer.session_id)::text,true);
  intent:=public.create_reserved_creator_event_purchase_intent((offer->>'id')::uuid,(offer->>'termsRevisionId')::uuid);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  receipt:=public.process_revenuecat_app_store_event_atomic('replay-deadline-paid','NON_RENEWING_PURCHASE',buyer.user_id,intent->>'providerProductId','sandbox',
    clock_timestamp(),null,99,'usd',repeat('a',64),'replay-deadline-original',null,(intent->>'createdAt')::timestamptz);
  if receipt->>'status'<>'processed' then raise exception 'replay fixture purchase failed: %',receipt; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',host.user_id,'session_id',host.session_id)::text,true);
  prepared:=public.prepare_creator_event_broadcast(event);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  insert into private.creator_event_broadcast_approvals(creator_id,creator_event_id,rights_status,max_minutes,expires_at,private_origin,approved_by,approved_session_id)
  values(host.user_id,null,'creator_owned',60,clock_timestamp()+interval '2 hours','https://private.example.test',buyer.user_id,buyer.session_id);
  select id into server from public.livekit_servers where server_id='event-test-server';
  insert into public.livekit_room_assignments(app_room_id,livekit_room_name,assigned_server_id,assignment_reason,room_type)
  values(prepared->>'roomId',prepared->>'roomId',server,'disposable replay deadline fixture','live_stage');
  perform public.heartbeat_creator_event_broadcast_worker();
  source:=public.claim_creator_event_broadcast_start(event,host.user_id,host.session_id);
  if source->>'claimed'<>'true' then raise exception 'replay fixture start failed: %',source; end if;
  perform public.record_creator_event_broadcast_provider(event,host.user_id,host.session_id,(source->>'attemptId')::uuid,'EG_replay_deadline','ACTIVE',
    source->>'privateOrigin'||'/'||(source->>'outputPrefix')||'/live.m3u8',source->>'outputPrefix'||'/live.m3u8',true,true);
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',host.user_id,'session_id',host.session_id)::text,true);
  perform public.manage_creator_event_lifecycle(event,'start',(select updated_at from public.creator_events where id=event));
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform public.record_creator_event_broadcast_provider(event,host.user_id,host.session_id,(source->>'attemptId')::uuid,'EG_replay_deadline','COMPLETE',
    source->>'privateOrigin'||'/'||(source->>'outputPrefix')||'/index.m3u8',source->>'outputPrefix'||'/index.m3u8',true,true);
  insert into event_reservation_fixture.replay_deadline_context values(jsonb_build_object('eventId',event,'hostId',host.user_id,'hostSession',host.session_id,
    'buyerId',buyer.user_id,'buyerSession',buyer.session_id,'intentId',intent->'id','revisionId',offer->'termsRevisionId','source',source));
end;$$;

-- Simulated clock advance for this throwaway fixture, not a production edit
-- path. Every real immutability trigger is active again before application RPCs.
create function event_reservation_fixture.set_replay_deadline(p_deadline timestamptz)
returns void language plpgsql as $$
declare c jsonb;
begin
  select context into c from event_reservation_fixture.replay_deadline_context;
  perform set_config('session_replication_role','replica',true);
  update private.creator_event_replay_policy_observation set started_at=p_deadline-interval '1 day';
  update public.creator_events set starts_at=p_deadline-interval '10 minutes',ends_at=p_deadline-interval '1 minute',
    replay_available_at=p_deadline,replay_expires_at=p_deadline+interval '1 day' where id=(c->>'eventId')::uuid;
  update public.creator_event_offer_revisions set terms=terms||jsonb_build_object('startsAt',p_deadline-interval '10 minutes',
    'endsAt',p_deadline-interval '1 minute','replayAvailableAt',p_deadline,'replayExpiresAt',p_deadline+interval '1 day')
    where id=(c->>'revisionId')::uuid;
  update private.creator_event_schedule_revisions set starts_at=p_deadline-interval '10 minutes',ends_at=p_deadline-interval '1 minute'
    where event_id=(c->>'eventId')::uuid;
  perform set_config('session_replication_role','origin',true);
end;$$;
