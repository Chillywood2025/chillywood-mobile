-- Synthetic provider/approval inputs, real full-schema authority and projectors.
-- Run only after event-reservation-authority.sql in a disposable database.
create table event_reservation_fixture.broadcast_assertions(label text primary key);
create function event_reservation_fixture.check_broadcast(p_ok boolean,p_label text)
returns void language plpgsql as $$begin
  if p_ok is distinct from true then raise exception 'broadcast assertion failed: %',p_label; end if;
  insert into event_reservation_fixture.broadcast_assertions values(p_label);
end;$$;
create table event_reservation_fixture.broadcast_context(event_id uuid,host_id uuid,session_id uuid,approval_id uuid,attempt_id uuid);

do $$
declare host event_reservation_fixture.actors;other event_reservation_fixture.actors;event uuid;
  premium public.monetization_products;prepared jsonb;a jsonb;b jsonb;receipt jsonb;authority jsonb;
  approval uuid;server uuid;first_stop timestamptz;first_broadcast uuid;first_attempt uuid;original_claims text;
  replay_case text;replay_event uuid;replay_prepared jsonb;replay_offer jsonb;intent jsonb;replay_attempt jsonb;
begin
  select * into host from event_reservation_fixture.actors where kind='creator';
  select * into other from event_reservation_fixture.actors where kind='buyer19';
  event:=gen_random_uuid();
  select * into premium from public.monetization_products where product_type='premium_subscription'
    and provider='revenuecat_google_play' and environment='sandbox' order by id limit 1;
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  receipt:=public.process_revenuecat_premium_event_atomic('revenuecat_google_play','broadcast-host-premium','INITIAL_PURCHASE',
    host.user_id,premium.provider_product_id,premium.provider_base_plan_id,'sandbox','active',now()-interval '1 minute',
    now()+interval '1 day',now(),999,'usd',repeat('a',64),'NORMAL','google_play','android',null,premium.id,'broadcast-host-original');
  perform event_reservation_fixture.check_broadcast(receipt->>'status'='processed','actual Premium projector supplies host authority');
  insert into public.creator_events(id,host_user_id,event_title,event_type,status,starts_at,ends_at,time_zone,replay_policy)
  values(event,host.user_id,'Broadcast recovery fixture','live_first','scheduled',now()-interval '1 hour',now()+interval '2 hours','America/New_York','none');
  original_claims:=jsonb_build_object('role','authenticated','sub',host.user_id,'session_id',host.session_id)::text;
  perform set_config('request.jwt.claims',original_claims,true);
  perform public.configure_paid_creator_event_sale(event,'Broadcast show',99,5,'sandbox','America/New_York',now()-interval '2 hours',now()+interval '1 hour');
  prepared:=public.prepare_creator_event_broadcast(event);
  begin
    perform public.approve_creator_event_broadcast(host.user_id,event,'creator_owned',30,now()+interval '1 hour','https://private.example.test');
    raise exception 'ordinary creator unexpectedly approved broadcast';
  exception when others then
    if sqlerrm not like '%event_broadcast_operator_required%' then raise; end if;
  end;
  perform event_reservation_fixture.check_broadcast(not has_function_privilege('authenticated',
    'public.claim_creator_event_broadcast_start(uuid,uuid,uuid)','execute'),'creator has no service start-claim privilege');
  perform event_reservation_fixture.check_broadcast(not has_table_privilege('authenticated',
    'private.creator_event_broadcast_attempts','insert'),'creator cannot fabricate an attempt');
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  authority:=public.read_creator_event_broadcast_producer_authority(event,host.user_id,host.session_id,'start');
  perform event_reservation_fixture.check_broadcast(authority->>'reason'='event_broadcast_worker_not_ready','worker lease required before start');
  perform public.heartbeat_creator_event_broadcast_worker();
  authority:=public.read_creator_event_broadcast_producer_authority(event,host.user_id,host.session_id,'start');
  perform event_reservation_fixture.check_broadcast(authority->>'reason'='event_broadcast_approval_required','creator self-start does not create implicit qualification');
  -- Trusted qualification is synthetic fixture data, never a provider action.
  insert into private.creator_event_broadcast_approvals(creator_id,creator_event_id,rights_status,max_minutes,expires_at,
    private_origin,approved_by,approved_session_id)
  values(host.user_id,event,'creator_owned',30,now()+interval '1 hour','https://private.example.test',other.user_id,other.session_id)
  returning id into approval;
  insert into public.livekit_servers(server_id,display_name,provider,region,public_ws_url,status)
  values('event-test-server','Synthetic event test server','other','test','wss://live.example.test','active') returning id into server;
  insert into public.livekit_room_assignments(app_room_id,livekit_room_name,assigned_server_id,assignment_reason,room_type)
  values(prepared->>'roomId',prepared->>'roomId',server,'disposable broadcast fixture','live_stage');
  a:=public.claim_creator_event_broadcast_start(event,host.user_id,host.session_id);
  perform event_reservation_fixture.check_broadcast(a->>'claimed'='true','first start claimed');
  first_stop:=(a->>'stopAt')::timestamptz;first_broadcast:=(a->>'broadcastId')::uuid;first_attempt:=(a->>'attemptId')::uuid;
  b:=public.claim_creator_event_broadcast_start(event,host.user_id,host.session_id);
  perform event_reservation_fixture.check_broadcast(b->>'claimed'='false' and b->>'attemptId'=a->>'attemptId','duplicate start retains original attempt');
  receipt:=public.record_creator_event_broadcast_provider(event,host.user_id,host.session_id,first_attempt,'EG_first','UNKNOWN',null,null,false,false);
  b:=public.claim_creator_event_broadcast_start(event,host.user_id,host.session_id);
  perform event_reservation_fixture.check_broadcast(b->>'claimed'='false' and b->>'state'='uncertain','unknown provider outcome cannot be replaced');
  receipt:=public.record_creator_event_broadcast_provider(event,host.user_id,host.session_id,first_attempt,'EG_first','COMPLETE',null,null,false,true);
  perform event_reservation_fixture.check_broadcast(receipt->>'state'='stopped','bound terminal receipt confirms cleanup');
  perform event_reservation_fixture.check_broadcast((select state='complete' from private.creator_event_broadcast_stop_jobs where attempt_id=first_attempt),'terminal receipt completes durable job');
  -- Replacing a state label alone never manufactures provider proof.
  update private.creator_event_broadcast_provider_receipts set binding_verified=false where attempt_id=first_attempt and provider_status='COMPLETE';
  b:=public.claim_creator_event_broadcast_start(event,host.user_id,host.session_id);
  perform event_reservation_fixture.check_broadcast(b->>'reason'='event_broadcast_terminal_receipt_required','terminal label without verified receipt cannot restart');
  update private.creator_event_broadcast_provider_receipts set binding_verified=true where attempt_id=first_attempt and provider_status='COMPLETE';
  update private.creator_event_broadcast_stop_jobs set state='pending' where attempt_id=first_attempt;
  b:=public.claim_creator_event_broadcast_start(event,host.user_id,host.session_id);
  perform event_reservation_fixture.check_broadcast(b->>'reason'='event_broadcast_terminal_receipt_required','unfinished cleanup blocks restart');
  update private.creator_event_broadcast_stop_jobs set state='complete' where attempt_id=first_attempt;
  update public.creator_events set starts_at=starts_at+interval '1 minute' where id=event;
  b:=public.claim_creator_event_broadcast_start(event,host.user_id,host.session_id);
  perform event_reservation_fixture.check_broadcast(b->>'reason'='event_broadcast_original_terms_required','reschedule cannot silently reuse original attempt terms');
  update public.creator_events set starts_at=starts_at-interval '1 minute' where id=event;
  update private.creator_event_broadcast_approvals set revoked_at=now() where id=approval;
  b:=public.claim_creator_event_broadcast_start(event,host.user_id,host.session_id);
  perform event_reservation_fixture.check_broadcast(b->>'reason'='event_broadcast_approval_required','revoked qualification blocks restart');
  update private.creator_event_broadcast_approvals set revoked_at=null where id=approval;
  b:=public.claim_creator_event_broadcast_start(event,host.user_id,other.session_id);
  perform event_reservation_fixture.check_broadcast(b->>'allowed'='false','foreign session cannot restart');
  update private.creator_event_broadcast_attempts set stop_at=now()-interval '1 second' where id=first_attempt;
  b:=public.claim_creator_event_broadcast_start(event,host.user_id,host.session_id);
  perform event_reservation_fixture.check_broadcast(b->>'reason'='event_broadcast_original_terms_required','original deadline cannot be reset by retry');
  update private.creator_event_broadcast_attempts set stop_at=first_stop where id=first_attempt;
  b:=public.claim_creator_event_broadcast_start(event,host.user_id,host.session_id);
  perform event_reservation_fixture.check_broadcast(b->>'claimed'='true','confirmed stopped attempt can restart same unchanged show');
  perform event_reservation_fixture.check_broadcast(b->>'attemptId'<>a->>'attemptId' and b->>'broadcastId'<>a->>'broadcastId','replacement uses new attempt and media identities');
  perform event_reservation_fixture.check_broadcast((b->>'stopAt')::timestamptz=first_stop,'replacement preserves first attempt deadline');
  perform event_reservation_fixture.check_broadcast(b->>'roomId'=a->>'roomId','host camera remains in original room');
  perform event_reservation_fixture.check_broadcast((select count(*)=2 from private.creator_event_broadcast_attempts where creator_event_id=event),'old attempt history retained');
  perform event_reservation_fixture.check_broadcast((select broadcast_session_id=(b->>'broadcastId')::uuid from private.creator_event_broadcast_preparations where creator_event_id=event),'preparation points to current media identity');
  receipt:=public.record_creator_event_broadcast_provider(event,host.user_id,host.session_id,(b->>'attemptId')::uuid,'EG_second','ACTIVE',
    b->>'privateOrigin'||'/'||(b->>'outputPrefix')||'/live.m3u8',(b->>'outputPrefix')||'/live.m3u8',true,true);
  perform event_reservation_fixture.check_broadcast(receipt->>'state'='active','current exact private provider receipt activates replacement');
  receipt:=public.record_creator_event_broadcast_provider(event,host.user_id,host.session_id,first_attempt,'EG_first','UNKNOWN',null,null,false,false);
  perform event_reservation_fixture.check_broadcast((select state='active' from private.creator_event_broadcast_attempts where id=(b->>'attemptId')::uuid),'late old receipt cannot change replacement');
  perform event_reservation_fixture.check_broadcast((select is_spectator_playback_enabled from public.room_broadcast_sessions where id=(b->>'broadcastId')::uuid),'old callback cannot disable current playback');
  perform event_reservation_fixture.check_broadcast((select count(*)=1 from public.creator_event_broadcast_ready_internal(event,host.user_id,false)
    where broadcast_id=(b->>'broadcastId')::uuid),'event resolves only verified current broadcast');
  -- Leave a confirmed failure for native two-session restart admission proof.
  receipt:=public.record_creator_event_broadcast_provider(event,host.user_id,host.session_id,(b->>'attemptId')::uuid,'EG_second','FAILED',null,null,false,true);
  perform event_reservation_fixture.check_broadcast(receipt->>'state'='failed','verified failure is terminal');
  perform event_reservation_fixture.check_broadcast((select not is_spectator_playback_enabled
    from public.room_broadcast_sessions where id=(b->>'broadcastId')::uuid),'terminal cleanup disables prior playback');
  update public.watch_party_room_memberships set last_seen_at=clock_timestamp() where party_id=b->>'roomId' and user_id=host.user_id::text;
  insert into event_reservation_fixture.broadcast_context values(event,host.user_id,host.session_id,approval,(b->>'attemptId')::uuid);
  for replay_case in select unnest(array['current','purchased']) loop
    perform set_config('request.jwt.claims','{"role":"service_role"}',true);
    replay_event:=gen_random_uuid();
    insert into public.creator_events(id,host_user_id,event_title,event_type,status,starts_at,ends_at,time_zone,replay_policy,replay_available_at,replay_expires_at)
    values(replay_event,host.user_id,'Promised replay fixture','live_first','scheduled',now()-interval '1 hour',now()+interval '2 hours',
      'America/New_York','until_expiration',now()+interval '2 hours',now()+interval '1 day');
    perform set_config('request.jwt.claims',original_claims,true);
    replay_offer:=public.configure_paid_creator_event_sale(replay_event,'Replay promised',99,5,'sandbox','America/New_York',now()-interval '2 hours',now()+interval '1 hour');
    if replay_case='purchased' then
      perform set_config('request.headers','{"x-chillywood-platform":"ios"}',true);
      perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',other.user_id,'session_id',other.session_id)::text,true);
      intent:=public.create_reserved_creator_event_purchase_intent((replay_offer->>'id')::uuid,(replay_offer->>'termsRevisionId')::uuid);
      perform set_config('request.jwt.claims','{"role":"service_role"}',true);
      receipt:=public.process_revenuecat_app_store_event_atomic('broadcast-purchased-replay','NON_RENEWING_PURCHASE',other.user_id,
        intent->>'providerProductId','sandbox',now(),null,99,'usd',repeat('b',64),'broadcast-purchased-replay-original',null,(intent->>'createdAt')::timestamptz);
      perform event_reservation_fixture.check_broadcast(receipt->>'status'='processed','actual purchase preserves original included replay');
      -- Model historical mutable-event drift only inside this owned fixture;
      -- current production writes must keep rejecting purchased replay edits.
      alter table public.creator_events disable trigger guard_creator_event_lifecycle;
      update public.creator_events set replay_policy='none',replay_available_at=null,replay_expires_at=null where id=replay_event;
      alter table public.creator_events enable trigger guard_creator_event_lifecycle;
      perform set_config('request.jwt.claims',original_claims,true);
    end if;
    replay_prepared:=public.prepare_creator_event_broadcast(replay_event);
    perform set_config('request.jwt.claims','{"role":"service_role"}',true);
    insert into private.creator_event_broadcast_approvals(creator_id,creator_event_id,rights_status,max_minutes,expires_at,
      private_origin,approved_by,approved_session_id)
    values(host.user_id,replay_event,'creator_owned',30,now()+interval '1 hour','https://private.example.test',other.user_id,other.session_id);
    insert into public.livekit_room_assignments(app_room_id,livekit_room_name,assigned_server_id,assignment_reason,room_type)
    values(replay_prepared->>'roomId',replay_prepared->>'roomId',server,'disposable replay recovery fixture','live_stage');
    replay_attempt:=public.claim_creator_event_broadcast_start(replay_event,host.user_id,host.session_id);
    perform event_reservation_fixture.check_broadcast(replay_attempt->>'claimed'='true',replay_case||' replay first attempt can be claimed');
    receipt:=public.record_creator_event_broadcast_provider(replay_event,host.user_id,host.session_id,(replay_attempt->>'attemptId')::uuid,
      'EG_replay_'||replay_case,'COMPLETE',null,null,false,true);
    authority:=public.claim_creator_event_broadcast_start(replay_event,host.user_id,host.session_id);
    perform event_reservation_fixture.check_broadcast(authority->>'reason'='event_broadcast_replay_recovery_required',replay_case||' replay promise cannot become a partial replacement recording');
  end loop;
end;$$;
