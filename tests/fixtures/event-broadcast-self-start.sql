-- Execute after the reservation and broadcast-authority fixtures in an owned,
-- disposable database. All qualifications are synthetic; no provider IO.
create table event_reservation_fixture.self_start_assertions(label text primary key);
create function event_reservation_fixture.check_self_start(p_ok boolean,p_label text)
returns void language plpgsql as $$begin
  if p_ok is distinct from true then raise exception 'self-start assertion failed: %',p_label; end if;
  insert into event_reservation_fixture.self_start_assertions values(p_label);
end;$$;

do $$
declare host event_reservation_fixture.actors; other event_reservation_fixture.actors;
  events uuid[]:=array[gen_random_uuid(),gen_random_uuid()]; event uuid; room text;
  prepared jsonb; authority jsonb; claimed jsonb; qualification uuid; server uuid;
  qualification_expiry timestamptz:=clock_timestamp()+interval '45 minutes';
  actor_claims text; n integer:=0;
begin
  select * into host from event_reservation_fixture.actors where kind='creator';
  select * into other from event_reservation_fixture.actors where kind='buyer19';
  select id into server from public.livekit_servers where server_id='event-test-server';
  actor_claims:=jsonb_build_object('role','authenticated','sub',host.user_id,'session_id',host.session_id)::text;
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  foreach event in array events loop
    n:=n+1;
    insert into public.creator_events(id,host_user_id,event_title,event_type,status,starts_at,ends_at,time_zone,replay_policy)
    values(event,host.user_id,'Creator self-start show '||n,'live_first','scheduled',now()-interval '1 minute',
      now()+make_interval(mins=>case when n=1 then 60 else 10 end),'America/New_York','none');
    perform set_config('request.jwt.claims',actor_claims,true);
    perform public.configure_paid_creator_event_sale(event,'Self-start show',99,5,'sandbox','America/New_York',now()-interval '2 minutes',now()+interval '5 minutes');
    prepared:=public.prepare_creator_event_broadcast(event);
    perform set_config('request.jwt.claims','{"role":"service_role"}',true);
    insert into public.livekit_room_assignments(app_room_id,livekit_room_name,assigned_server_id,assignment_reason,room_type)
    values(prepared->>'roomId',prepared->>'roomId',server,'disposable self-start qualification fixture','live_stage');
  end loop;
  perform public.heartbeat_creator_event_broadcast_worker();
  authority:=public.read_creator_event_broadcast_producer_authority(events[1],host.user_id,host.session_id,'start');
  perform event_reservation_fixture.check_self_start(authority->>'reason'='event_broadcast_approval_required',
    'another show-specific qualification does not authorize a new show');
  insert into private.creator_event_broadcast_approvals(creator_id,creator_event_id,rights_status,max_minutes,expires_at,
    private_origin,approved_by,approved_session_id)
  values(host.user_id,null,'creator_owned',30,qualification_expiry,'https://private.example.test',other.user_id,other.session_id)
  returning id into qualification;

  authority:=public.read_creator_event_broadcast_producer_authority(events[1],host.user_id,host.session_id,'start');
  perform event_reservation_fixture.check_self_start(authority->>'allowed'='true' and authority->>'canStart'='true'
    and authority->>'approvalId'=qualification::text,'creator-scoped finite qualification authorizes a new owned show');
  authority:=public.read_creator_event_broadcast_producer_authority(events[1],other.user_id,other.session_id,'start');
  perform event_reservation_fixture.check_self_start(authority->>'allowed'='false','qualification never transfers event ownership');
  authority:=public.read_creator_event_broadcast_producer_authority(events[1],host.user_id,other.session_id,'start');
  perform event_reservation_fixture.check_self_start(authority->>'allowed'='false','qualified creator still needs the exact current session');
  update public.wave1_creator_eligibility set age_18_plus=false where creator_user_id=host.user_id;
  authority:=public.read_creator_event_broadcast_producer_authority(events[1],host.user_id,host.session_id,'start');
  perform event_reservation_fixture.check_self_start(authority->>'allowed'='false','creator qualification does not bypass current age eligibility');
  update public.wave1_creator_eligibility set age_18_plus=true,kyc_complete=false where creator_user_id=host.user_id;
  authority:=public.read_creator_event_broadcast_producer_authority(events[1],host.user_id,host.session_id,'start');
  perform event_reservation_fixture.check_self_start(authority->>'allowed'='false','creator qualification does not bypass current identity eligibility');
  update public.wave1_creator_eligibility set kyc_complete=true where creator_user_id=host.user_id;
  update private.creator_event_broadcast_approvals set revoked_at=clock_timestamp() where id=qualification;
  authority:=public.read_creator_event_broadcast_producer_authority(events[1],host.user_id,host.session_id,'start');
  perform event_reservation_fixture.check_self_start(authority->>'reason'='event_broadcast_approval_required','revoked creator qualification cannot self-start');
  update private.creator_event_broadcast_approvals set revoked_at=null,expires_at=clock_timestamp()-interval '1 second' where id=qualification;
  authority:=public.read_creator_event_broadcast_producer_authority(events[1],host.user_id,host.session_id,'start');
  perform event_reservation_fixture.check_self_start(authority->>'reason'='event_broadcast_approval_required','expired creator qualification cannot self-start');
  update private.creator_event_broadcast_approvals set expires_at=qualification_expiry where id=qualification;
  update private.creator_event_broadcast_worker_health set expires_at=clock_timestamp()-interval '1 second';
  authority:=public.read_creator_event_broadcast_producer_authority(events[1],host.user_id,host.session_id,'start');
  perform event_reservation_fixture.check_self_start(authority->>'reason'='event_broadcast_worker_not_ready','creator qualification does not bypass shutdown worker readiness');
  perform public.heartbeat_creator_event_broadcast_worker();
  select party_id into room from private.creator_event_broadcast_preparations where creator_event_id=events[1];
  update public.watch_party_room_memberships set last_seen_at=clock_timestamp()-interval '1 minute' where party_id=room and user_id=host.user_id::text;
  authority:=public.read_creator_event_broadcast_producer_authority(events[1],host.user_id,host.session_id,'start');
  perform event_reservation_fixture.check_self_start(authority->>'allowed'='false','creator qualification requires current host presence');
  update public.watch_party_room_memberships set last_seen_at=clock_timestamp() where party_id=room and user_id=host.user_id::text;
  begin
    update public.watch_party_rooms set discovery_visibility='public' where party_id=room;
    raise exception 'private event room unexpectedly became public';
  exception when others then
    if sqlerrm not like '%event_broadcast_host_room_identity_required%' then raise; end if;
  end;
  perform event_reservation_fixture.check_self_start((select discovery_visibility='private' from public.watch_party_rooms where party_id=room),
    'creator qualification does not broaden private event media');
  update public.livekit_room_assignments set assignment_status='ended',ended_at=clock_timestamp() where app_room_id=room;
  authority:=public.read_creator_event_broadcast_producer_authority(events[1],host.user_id,host.session_id,'start');
  perform event_reservation_fixture.check_self_start(authority->>'reason'='event_broadcast_assignment_required','creator qualification needs an active assigned server');
  update public.livekit_room_assignments set assignment_status='assigned',ended_at=null where app_room_id=room;
  perform event_reservation_fixture.check_self_start(not has_table_privilege('authenticated','private.creator_event_broadcast_approvals','insert')
    and not has_table_privilege('authenticated','private.creator_event_broadcast_approvals','update'),'self-start never grants qualification write access');
  n:=0;
  foreach event in array events loop
    n:=n+1;
    claimed:=public.claim_creator_event_broadcast_start(event,host.user_id,host.session_id);
    perform event_reservation_fixture.check_self_start(claimed->>'claimed'='true','creator self-starts distinct show '||n);
    perform event_reservation_fixture.check_self_start((select approval_id=qualification and stop_at<=qualification_expiry
      and stop_at<=started_at+interval '30 minutes' and stop_at<=(select ends_at from public.creator_events where id=event)
      from private.creator_event_broadcast_attempts where id=(claimed->>'attemptId')::uuid),'show '||n||' retains qualification and finite deadline');
  end loop;
  perform event_reservation_fixture.check_self_start(not exists(select 1 from private.creator_event_broadcast_approvals
    where creator_event_id=any(events)),'two show starts need no separate per-show approval rows');
  perform event_reservation_fixture.check_self_start((select count(*)=2 from private.creator_event_broadcast_attempts
    where creator_event_id=any(events) and approval_id=qualification),'both shows bind the same finite creator qualification');
end;$$;
