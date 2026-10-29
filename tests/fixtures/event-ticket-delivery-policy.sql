-- Independent delivery-policy proof using actual authority, purchase, producer
-- receipt and creator lifecycle functions. Only provider/qualification inputs
-- are synthetic. Run after event-reservation-authority.sql and
-- event-broadcast-producer-authority.sql in an owned disposable database.
create table event_reservation_fixture.delivery_assertions(label text primary key);
create function event_reservation_fixture.check_delivery(p_ok boolean,p_label text)
returns void language plpgsql as $$begin
  if p_ok is distinct from true then raise exception 'delivery assertion failed: %',p_label; end if;
  insert into event_reservation_fixture.delivery_assertions values(p_label);
end;$$;

-- Own a separate synthetic creator so five independent delivery cases do not
-- consume the earlier fixture creator's room quota. The real five-room abuse
-- guard remains enabled; no counter, limiter or application function is reset.
do $$
declare host event_reservation_fixture.actors;premium public.monetization_products;receipt jsonb;
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  insert into event_reservation_fixture.actors
  select creator_id,md5('event-delivery-session:'||creator_id::text)::uuid,'delivery_creator'
  from (select md5('event-delivery-creator:'||n::text)::uuid creator_id from generate_series(1,1000)n)candidates
  where mod(hashtextextended('chillywood-wave1-us-rollout-v1:'||creator_id::text,20260814),100)=0 limit 1;
  select * into host from event_reservation_fixture.actors where kind='delivery_creator';
  insert into auth.users(id,is_sso_user,is_anonymous,email,email_confirmed_at)
    values(host.user_id,false,false,'delivery-creator@event-reservation.example',now());
  insert into auth.sessions(id,user_id) values(host.session_id,host.user_id);
  insert into public.sandbox_monetization_testers(user_id,status,note)
    values(host.user_id::text,'active','Synthetic local delivery-policy fixture');
  insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,
    role_key,capability,session_generation,authority_source)
  select host.user_id,public.wave1_sha256(host.user_id::text),d.document_key,d.version,d.market,
    'member',d.capability,host.session_id::text,'service_reconciliation'
  from public.wave1_legal_document_versions d where d.active and d.market='UNITED_STATES'
    and d.capability in('account','creator','creator_money');
  perform public.wave1_evaluate_creator_eligibility(host.user_id,jsonb_build_object(
    'accountStatus','ACTIVE','age18Plus',true,'legalAccepted',true,'creatorRole',true,'moderationState','CLEAR',
    'market','UNITED_STATES','rolloutEligible',false,'platformCapability',true,'providerEligible',true,
    'kycComplete',true,'taxComplete',true,'sanctionsClear',true,'payoutEligible',true,
    'inputVersions',jsonb_build_object('evaluationSequence',1)),'event-delivery-synthetic','local_pgtap');
  select * into premium from public.monetization_products where product_type='premium_subscription'
    and provider='revenuecat_google_play' and environment='sandbox' order by id limit 1;
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  receipt:=public.process_revenuecat_premium_event_atomic('revenuecat_google_play','delivery-host-premium','INITIAL_PURCHASE',
    host.user_id,premium.provider_product_id,premium.provider_base_plan_id,'sandbox','active',now()-interval '1 minute',
    now()+interval '1 day',now(),999,'usd',repeat('b',64),'NORMAL','google_play','android',null,premium.id,'delivery-host-original');
  if receipt->>'status'<>'processed' then raise exception 'delivery fixture Premium did not process: %',receipt; end if;
end;$$;

create function event_reservation_fixture.delivery_show(p_label text,p_start timestamptz,p_buy boolean default true)
returns jsonb language plpgsql as $$
declare host event_reservation_fixture.actors;buyer event_reservation_fixture.actors;
  event uuid:=gen_random_uuid();offer jsonb;intent jsonb;receipt jsonb;prepared jsonb;source jsonb;server uuid;
begin
  select * into host from event_reservation_fixture.actors where kind='delivery_creator';
  select * into buyer from event_reservation_fixture.actors where kind='buyer17';
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  insert into public.creator_events(id,host_user_id,event_title,event_type,status,starts_at,ends_at,time_zone,replay_policy)
  values(event,host.user_id,p_label,'live_first','scheduled',p_start,clock_timestamp()+interval '2 hours','America/New_York','none');
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',host.user_id,'session_id',host.session_id)::text,true);
  offer:=public.configure_paid_creator_event_sale(event,'Delivery-policy live-only fixture',99,5,'sandbox','America/New_York',
    clock_timestamp()-interval '2 hours',clock_timestamp()+interval '1 hour');
  if p_buy then
    perform set_config('request.headers','{"x-chillywood-platform":"ios"}',true);
    perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',buyer.user_id,'session_id',buyer.session_id)::text,true);
    intent:=public.create_reserved_creator_event_purchase_intent((offer->>'id')::uuid,(offer->>'termsRevisionId')::uuid);
    perform set_config('request.jwt.claims','{"role":"service_role"}',true);
    receipt:=public.process_revenuecat_app_store_event_atomic('delivery-'||event::text,'NON_RENEWING_PURCHASE',buyer.user_id,
      intent->>'providerProductId','sandbox',now(),null,99,'usd',repeat('a',64),'delivery-original-'||event::text,null,
      (intent->>'createdAt')::timestamptz);
    if receipt->>'status'<>'processed' then raise exception 'delivery fixture purchase did not process: %',receipt; end if;
    -- Keep the synthetic provider occurrence at this transaction's current
    -- instant: the real pass projector compares grant start with now(). A
    -- later clock_timestamp() in the same DO would describe a future grant.
    if not exists(select 1 from public.paid_creator_event_passes p join public.event_ticket_reservations r
      on r.access_grant_id=p.access_grant_id where p.creator_event_id=event and p.buyer_id=buyer.user_id
        and r.purchase_intent_id=(intent->>'id')::uuid and p.status='active')
    then raise exception 'delivery fixture exact purchased pass missing: %',p_label; end if;
  end if;
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',host.user_id,'session_id',host.session_id)::text,true);
  prepared:=public.prepare_creator_event_broadcast(event);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  insert into private.creator_event_broadcast_approvals(creator_id,creator_event_id,rights_status,max_minutes,expires_at,
    private_origin,approved_by,approved_session_id)
  values(host.user_id,event,'creator_owned',60,clock_timestamp()+interval '2 hours','https://private.example.test',buyer.user_id,buyer.session_id);
  select id into server from public.livekit_servers where server_id='event-test-server';
  insert into public.livekit_room_assignments(app_room_id,livekit_room_name,assigned_server_id,assignment_reason,room_type)
  values(prepared->>'roomId',prepared->>'roomId',server,'disposable delivery policy fixture','live_stage');
  perform public.heartbeat_creator_event_broadcast_worker();
  source:=public.claim_creator_event_broadcast_start(event,host.user_id,host.session_id);
  if source->>'claimed'<>'true' then raise exception 'delivery fixture broadcast not claimed: %',source; end if;
  return jsonb_build_object('eventId',event,'hostId',host.user_id,'hostSession',host.session_id,
    'buyerId',buyer.user_id,'buyerSession',buyer.session_id,'intentId',intent->'id','source',source);
end;$$;

create function event_reservation_fixture.delivery_receipt(p_context jsonb,p_source jsonb,p_status text,p_suffix text)
returns jsonb language plpgsql as $$
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  return public.record_creator_event_broadcast_provider((p_context->>'eventId')::uuid,(p_context->>'hostId')::uuid,
    (p_context->>'hostSession')::uuid,(p_source->>'attemptId')::uuid,'EG_delivery_'||p_suffix,p_status,
    case when p_status='ACTIVE' then p_source->>'privateOrigin'||'/'||(p_source->>'outputPrefix')||'/live.m3u8' else null end,
    case when p_status='ACTIVE' then p_source->>'outputPrefix'||'/live.m3u8' else null end,p_status='ACTIVE',true);
end;$$;

-- Delivery scenario assertions begin. The prefix above is shared setup for
-- the independent pre-policy migration-transition fixture.
do $$
declare prepared jsonb;timely jsonb;late jsonb;future jsonb;receipt jsonb;policy jsonb;source jsonb;replacement jsonb;
  event public.creator_events;fact private.creator_event_verified_start_facts;first_fact jsonb;accepted_revision uuid;
  first_start timestamptz;future_start timestamptz;host_claims text;buyer_claims text;original_epoch timestamptz;
begin
  -- Deterministic time fixture only: model a policy already observing these
  -- show windows instead of waiting thirty real minutes. Temporarily bypass
  -- only this seed-row immutability trigger, immediately re-enable it, then
  -- restore the actual epoch at the end. No delivery facts, application
  -- functions, RLS, abuse limiter, or other trigger are changed.
  select started_at into strict original_epoch from private.creator_event_ticket_policy_observation where singleton;
  alter table private.creator_event_ticket_policy_observation disable trigger creator_event_ticket_policy_observation_immutable;
  update private.creator_event_ticket_policy_observation set started_at=clock_timestamp()-interval '1 day' where singleton;
  alter table private.creator_event_ticket_policy_observation enable trigger creator_event_ticket_policy_observation_immutable;
  begin
    update private.creator_event_ticket_policy_observation set started_at=clock_timestamp() where singleton;
    raise exception 'observation epoch unexpectedly mutable during scenarios';
  exception when others then if sqlerrm not like '%event_ticket_policy_history_immutable%' then raise; end if; end;
  perform event_reservation_fixture.check_delivery(not has_table_privilege('authenticated','private.creator_event_ticket_policy_observation','update')
    and not has_table_privilege('service_role','private.creator_event_ticket_policy_observation','update'),
    'observation epoch remains immutable and unwritable during temporal scenarios');
  prepared:=event_reservation_fixture.delivery_show('Prepared but never opened',clock_timestamp()-interval '31 minutes');
  select * into event from public.creator_events where id=(prepared->>'eventId')::uuid;
  host_claims:=jsonb_build_object('role','authenticated','sub',prepared->>'hostId','session_id',prepared->>'hostSession')::text;
  buyer_claims:=jsonb_build_object('role','authenticated','sub',prepared->>'buyerId','session_id',prepared->>'buyerSession')::text;
  perform set_config('request.jwt.claims',host_claims,true);
  begin
    perform public.manage_creator_event_lifecycle(event.id,'start',event.updated_at);
    raise exception 'unverified show unexpectedly opened';
  exception when others then if sqlerrm not like '%event_verified_broadcast_required%' then raise; end if; end;
  perform event_reservation_fixture.check_delivery((select status='scheduled' from public.creator_events where id=event.id),
    'host lifecycle toggle alone cannot open a show');
  perform event_reservation_fixture.check_delivery(not exists(select 1 from private.creator_event_verified_start_facts where event_id=event.id),
    'unverified host toggle creates no delivery fact');
  receipt:=event_reservation_fixture.delivery_receipt(prepared,prepared->'source','ACTIVE','prepared');
  perform event_reservation_fixture.check_delivery(receipt->>'state'='active','prepared source has real verified ACTIVE projector');
  perform event_reservation_fixture.check_delivery(not exists(select 1 from private.creator_event_verified_start_facts where event_id=event.id),
    'verified prepared media without open event creates no delivery fact');
  perform set_config('request.jwt.claims',buyer_claims,true);
  policy:=public.read_my_creator_event_ticket_policy(event.id,(prepared->>'intentId')::uuid);
  perform event_reservation_fixture.check_delivery(policy->'refundEligibility'->'reasons' ? 'event_no_show',
    'never-opened verified broadcast retains actual buyer no-show review');

  timely:=event_reservation_fixture.delivery_show('Timely opened show',clock_timestamp()-interval '1 minute');
  source:=timely->'source';receipt:=event_reservation_fixture.delivery_receipt(timely,source,'ACTIVE','timely');
  select * into event from public.creator_events where id=(timely->>'eventId')::uuid;
  first_start:=event.starts_at;
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',timely->>'hostId','session_id',timely->>'hostSession')::text,true);
  perform public.manage_creator_event_lifecycle(event.id,'start',event.updated_at);
  select * into fact from private.creator_event_verified_start_facts where event_id=event.id;
  perform event_reservation_fixture.check_delivery(fact.attempt_id=(source->>'attemptId')::uuid and fact.advertised_starts_at=first_start
    and fact.advertised_time_zone='America/New_York' and fact.verified_at>=first_start,'actual open captures exact verified delivery and advertised instant');
  perform event_reservation_fixture.check_delivery(exists(select 1 from private.creator_event_schedule_revisions r
    where r.id=fact.revision_id and r.event_id=event.id and r.event_status='live_now'),'delivery records exact opened revision');
  perform event_reservation_fixture.check_delivery(not private.creator_event_no_show_due(first_start,
    private.creator_event_verified_start_at(event.id,first_start),first_start+interval '30 minutes'),'captured timely opening satisfies the actual thirty-minute deadline');
  first_fact:=to_jsonb(fact);
  receipt:=event_reservation_fixture.delivery_receipt(timely,source,'FAILED','timely');
  perform event_reservation_fixture.check_delivery(receipt->>'state'='failed','production terminal receipt closes first delivery attempt');
  perform event_reservation_fixture.check_delivery((select to_jsonb(f)=first_fact from private.creator_event_verified_start_facts f where attempt_id=fact.attempt_id),
    'terminal cleanup preserves immutable successful delivery fact');
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  replacement:=public.claim_creator_event_broadcast_start(event.id,(timely->>'hostId')::uuid,(timely->>'hostSession')::uuid);
  perform event_reservation_fixture.check_delivery(replacement->>'claimed'='true' and replacement->>'attemptId'<>source->>'attemptId',
    'actual confirmed-terminal recovery creates distinct replacement');
  receipt:=event_reservation_fixture.delivery_receipt(timely,replacement,'ACTIVE','replacement');
  perform event_reservation_fixture.check_delivery(receipt->>'state'='active' and
    (select count(*)=2 from private.creator_event_verified_start_facts where event_id=event.id),'replacement records its own actual opening without deleting first fact');
  perform event_reservation_fixture.check_delivery(private.creator_event_verified_start_at(event.id,first_start)=fact.verified_at,
    'earliest legitimate delivery remains authoritative after replacement');
  future_start:=fact.verified_at+interval '1 hour';
  perform event_reservation_fixture.check_delivery(private.creator_event_verified_start_at(event.id,future_start) is null
    and private.creator_event_no_show_due(future_start,private.creator_event_verified_start_at(event.id,future_start),future_start+interval '30 minutes'),
    'earlier actual delivery cannot satisfy a future accepted schedule deadline');
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',timely->>'hostId','session_id',timely->>'hostSession')::text,true);
  select * into event from public.creator_events where id=event.id;
  perform public.manage_creator_event_lifecycle(event.id,'end',event.updated_at);
  perform event_reservation_fixture.check_delivery((select to_jsonb(f)=first_fact from private.creator_event_verified_start_facts f where attempt_id=fact.attempt_id),
    'ending the event retains successful delivery history');

  late:=event_reservation_fixture.delivery_show('Late opened show',clock_timestamp()-interval '31 minutes');
  source:=late->'source';receipt:=event_reservation_fixture.delivery_receipt(late,source,'ACTIVE','late');
  select * into event from public.creator_events where id=(late->>'eventId')::uuid;
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',late->>'hostId','session_id',late->>'hostSession')::text,true);
  perform public.manage_creator_event_lifecycle(event.id,'start',event.updated_at);
  perform event_reservation_fixture.check_delivery(exists(select 1 from private.creator_event_verified_start_facts where event_id=event.id
    and verified_at>event.starts_at+interval '30 minutes'),'late opening has truthful post-deadline delivery fact');
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',late->>'buyerId','session_id',late->>'buyerSession')::text,true);
  policy:=public.read_my_creator_event_ticket_policy(event.id,(late->>'intentId')::uuid);
  perform event_reservation_fixture.check_delivery(policy->'refundEligibility'->'reasons' ? 'event_no_show','later actual opening does not erase buyer no-show protection');

  future:=event_reservation_fixture.delivery_show('Empty paid offer before start',clock_timestamp()+interval '30 minutes',false);
  receipt:=event_reservation_fixture.delivery_receipt(future,future->'source','ACTIVE','future');
  select * into event from public.creator_events where id=(future->>'eventId')::uuid;
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',future->>'hostId','session_id',future->>'hostSession')::text,true);
  begin
    perform public.manage_creator_event_lifecycle(event.id,'start',event.updated_at);
    raise exception 'empty paid offer unexpectedly opened early';
  exception when others then if sqlerrm not like '%event_advertised_start_not_reached%' then raise; end if; end;
  perform event_reservation_fixture.check_delivery((select status='scheduled' from public.creator_events where id=event.id)
    and not exists(select 1 from private.creator_event_verified_start_facts where event_id=event.id),
    'paid offer with zero buyers stays closed until advertised start');

  -- A verified preflight may remain prepared across a later accepted schedule;
  -- neither that media nor consent itself proves the future show was delivered.
  future:=event_reservation_fixture.delivery_show('Accepted later schedule stays protected',clock_timestamp()-interval '1 minute');
  receipt:=event_reservation_fixture.delivery_receipt(future,future->'source','ACTIVE','accepted');
  select * into event from public.creator_events where id=(future->>'eventId')::uuid;
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',future->>'hostId','session_id',future->>'hostSession')::text,true);
  perform public.manage_creator_event_lifecycle(event.id,'reschedule',event.updated_at,clock_timestamp()+interval '1 hour',null,null,'Later schedule',false);
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',future->>'buyerId','session_id',future->>'buyerSession')::text,true);
  policy:=public.read_my_creator_event_ticket_policy(event.id,(future->>'intentId')::uuid);
  accepted_revision:=(policy->'currentRevision'->>'id')::uuid;
  policy:=public.respond_creator_event_schedule_change(event.id,(future->>'intentId')::uuid,accepted_revision,'keep_ticket');
  perform event_reservation_fixture.check_delivery(policy->>'acceptedRevisionId'=accepted_revision::text,'later schedule is accepted through actual exact-revision buyer RPC');
  future_start:=(policy->'currentRevision'->>'startsAt')::timestamptz;
  perform event_reservation_fixture.check_delivery(private.creator_event_verified_start_at(event.id,future_start) is null
    and private.creator_event_no_show_due(future_start,private.creator_event_verified_start_at(event.id,future_start),future_start+interval '30 minutes'),
    'accepted future schedule retains no-show protection despite earlier prepared media');
  alter table private.creator_event_ticket_policy_observation disable trigger creator_event_ticket_policy_observation_immutable;
  update private.creator_event_ticket_policy_observation set started_at=original_epoch where singleton;
  alter table private.creator_event_ticket_policy_observation enable trigger creator_event_ticket_policy_observation_immutable;
  perform event_reservation_fixture.check_delivery((select started_at=original_epoch from private.creator_event_ticket_policy_observation where singleton)
    and (select tgenabled='O' from pg_trigger where tgrelid='private.creator_event_ticket_policy_observation'::regclass
      and tgname='creator_event_ticket_policy_observation_immutable'),'temporal fixture restores exact original epoch and its immutable guard');
end;$$;
