-- Durable, private event Egress authority. This creates no approvals, starts no
-- provider, changes no credentials and gives creators no operator privileges.
-- An approval may qualify a creator for a finite window or one exact event;
-- choosing that operational scope remains an explicit operator/owner action.
create table private.creator_event_broadcast_approvals(
  id uuid primary key default gen_random_uuid(),creator_id uuid not null references auth.users(id),
  creator_event_id uuid references public.creator_events(id),rights_status text not null
    check(rights_status in('creator_owned','chillywood_original','licensed_for_public_stream')),
  max_minutes integer not null check(max_minutes>0),expires_at timestamptz not null check(isfinite(expires_at)),
  private_origin text not null check(private_origin~'^https://[a-zA-Z0-9.-]+(:[0-9]+)?$'),
  approved_by uuid not null,approved_session_id uuid not null,created_at timestamptz not null default clock_timestamp(),revoked_at timestamptz
);
create table private.creator_event_broadcast_worker_health(
  singleton boolean primary key default true check(singleton),last_completed_at timestamptz not null,expires_at timestamptz not null
);
create table private.creator_event_broadcast_attempts(
  id uuid primary key default gen_random_uuid(),creator_event_id uuid not null unique references public.creator_events(id),
  creator_id uuid not null,creator_session_id uuid not null,party_id text not null,broadcast_session_id uuid not null unique,
  approval_id uuid not null references private.creator_event_broadcast_approvals(id),
  assignment_id uuid not null references public.livekit_room_assignments(id),server_id uuid not null references public.livekit_servers(id),
  livekit_room_name text not null,rights_status text not null,private_origin text not null,max_minutes integer not null,
  approval_expires_at timestamptz not null,output_prefix text not null unique,
  state text not null check(state in('starting','active','stopping','stopped','failed','uncertain')),
  egress_id text,started_at timestamptz not null,stop_at timestamptz not null,
  reason text,updated_at timestamptz not null default clock_timestamp()
);
create unique index creator_event_broadcast_attempt_egress on private.creator_event_broadcast_attempts(server_id,egress_id) where egress_id is not null;
create table private.creator_event_broadcast_provider_receipts(
  id uuid primary key default gen_random_uuid(),attempt_id uuid not null references private.creator_event_broadcast_attempts(id),
  provider_status text not null,egress_id text,private_origin_verified boolean not null,binding_verified boolean not null,
  received_at timestamptz not null default clock_timestamp()
);
create table private.creator_event_broadcast_stop_jobs(
  attempt_id uuid primary key references private.creator_event_broadcast_attempts(id),due_at timestamptz not null,
  state text not null default 'pending' check(state in('pending','leased','complete')),
  lease_expires_at timestamptz,claims integer not null default 0,reason text not null
);
alter table private.creator_event_broadcast_approvals enable row level security;
alter table private.creator_event_broadcast_approvals force row level security;
alter table private.creator_event_broadcast_worker_health enable row level security;
alter table private.creator_event_broadcast_worker_health force row level security;
alter table private.creator_event_broadcast_attempts enable row level security;
alter table private.creator_event_broadcast_attempts force row level security;
alter table private.creator_event_broadcast_provider_receipts enable row level security;
alter table private.creator_event_broadcast_provider_receipts force row level security;
alter table private.creator_event_broadcast_stop_jobs enable row level security;
alter table private.creator_event_broadcast_stop_jobs force row level security;
revoke all on private.creator_event_broadcast_approvals,private.creator_event_broadcast_worker_health,
  private.creator_event_broadcast_attempts,private.creator_event_broadcast_provider_receipts,
  private.creator_event_broadcast_stop_jobs from public,anon,authenticated,service_role;

create function private.creator_event_broadcast_actor_current(p_user_id uuid,p_session_id uuid,p_party_id text,p_require_host boolean)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare claims text:=current_setting('request.jwt.claims',true); allowed boolean;
begin
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',p_user_id,'session_id',p_session_id)::text,true);
  allowed:=p_user_id is not null and p_session_id is not null and public.whole_app_exact_current_session_authority_internal()
    and public.wave1_current_caller_authority_internal() and not public.is_account_access_restricted(p_user_id::text);
  if allowed and p_require_host then
    allowed:=public.premium_subject_has_finite_authority_internal(p_user_id::text)
      and public.wave1_creator_money_subject_authorized_internal(p_user_id)
      and exists(select 1 from public.watch_party_rooms r join public.watch_party_room_memberships m on m.party_id=r.party_id
        where r.party_id=p_party_id and r.host_user_id=p_user_id and r.is_active and r.room_type='live'
          and r.join_policy='locked' and r.discovery_visibility='private' and r.content_access_rule='premium'
          and m.user_id=p_user_id::text and m.role='host' and m.membership_state='active' and m.left_at is null
          and m.last_seen_at>clock_timestamp()-interval '45 seconds');
  end if;
  perform set_config('request.jwt.claims',coalesce(claims,''),true);
  return coalesce(allowed,false);
exception when others then
  perform set_config('request.jwt.claims',coalesce(claims,''),true);raise;
end;
$$;
revoke all on function private.creator_event_broadcast_actor_current(uuid,uuid,text,boolean) from public,anon,authenticated,service_role;

create function private.creator_event_broadcast_attempt_row(a private.creator_event_broadcast_attempts)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('eventId',a.creator_event_id,'hostId',a.creator_id,'creatorSessionId',a.creator_session_id,
   'roomId',a.party_id,'broadcastId',a.broadcast_session_id,'attemptId',a.id,'state',a.state,'egressId',a.egress_id,
   'serverId',a.server_id,'assignmentId',a.assignment_id,'livekitRoomName',a.livekit_room_name,
   'outputPrefix',a.output_prefix,'privateOrigin',a.private_origin,'startedAt',a.started_at,'stopAt',a.stop_at,'reason',a.reason,
   'approval',jsonb_build_object('rightsStatus',a.rights_status,'maxMinutes',a.max_minutes,'expiresAt',a.approval_expires_at));
$$;
revoke all on function private.creator_event_broadcast_attempt_row(private.creator_event_broadcast_attempts) from public,anon,authenticated,service_role;

create function public.approve_creator_event_broadcast(p_creator_user_id uuid,p_creator_event_id uuid,p_rights_status text,
  p_max_minutes integer,p_expires_at timestamptz,p_private_origin text)
returns uuid language plpgsql security definer set search_path='' as $$
declare approval uuid;
begin
  if auth.role()<>'authenticated' or not public.whole_app_exact_current_session_authority_internal()
    or not public.has_platform_role(array['owner','operator']) then raise exception 'event_broadcast_operator_required'; end if;
  if p_creator_user_id is null or not exists(select 1 from auth.users where id=p_creator_user_id)
    or (p_creator_event_id is not null and not exists(select 1 from public.creator_events where id=p_creator_event_id and host_user_id=p_creator_user_id))
    or p_expires_at is null or not isfinite(p_expires_at) or p_expires_at<=clock_timestamp()
  then raise exception 'event_broadcast_approval_invalid'; end if;
  insert into private.creator_event_broadcast_approvals(creator_id,creator_event_id,rights_status,max_minutes,expires_at,private_origin,approved_by,approved_session_id)
  values(p_creator_user_id,p_creator_event_id,p_rights_status,p_max_minutes,p_expires_at,p_private_origin,auth.uid(),(auth.jwt()->>'session_id')::uuid)
  returning id into approval;
  return approval;
end;
$$;
revoke all on function public.approve_creator_event_broadcast(uuid,uuid,text,integer,timestamptz,text) from public,anon,authenticated,service_role;
grant execute on function public.approve_creator_event_broadcast(uuid,uuid,text,integer,timestamptz,text) to authenticated;

create function public.heartbeat_creator_event_broadcast_worker()
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  insert into private.creator_event_broadcast_worker_health values(true,clock_timestamp(),clock_timestamp()+interval '2 minutes')
  on conflict(singleton) do update set last_completed_at=excluded.last_completed_at,expires_at=excluded.expires_at;
end;
$$;
revoke all on function public.heartbeat_creator_event_broadcast_worker() from public,anon,authenticated,service_role;
grant execute on function public.heartbeat_creator_event_broadcast_worker() to service_role;

create function public.read_creator_event_broadcast_producer_authority(p_creator_event_id uuid,p_user_id uuid,p_session_id uuid,p_action text default 'start')
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare e public.creator_events;p private.creator_event_broadcast_preparations;a private.creator_event_broadcast_attempts;
  approval private.creator_event_broadcast_approvals;assignment public.livekit_room_assignments;denied jsonb;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  denied:=jsonb_build_object('allowed',false,'eventId',p_creator_event_id,'reason','event_broadcast_authority_required');
  if p_action is null or p_action not in('start','refresh','stop') then return denied; end if;
  select * into e from public.creator_events where id=p_creator_event_id;
  select * into p from private.creator_event_broadcast_preparations where creator_event_id=e.id;
  if e.id is null or e.host_user_id is distinct from p_user_id or p.creator_event_id is null
    or p.host_user_id is distinct from p_user_id or not private.creator_event_broadcast_actor_current(p_user_id,p_session_id,p.party_id,p_action='start')
  then return denied; end if;
  select * into a from private.creator_event_broadcast_attempts where creator_event_id=e.id;
  if a.id is not null then
    return private.creator_event_broadcast_attempt_row(a)||jsonb_build_object('allowed',true,'reason','existing_attempt','canStart',false);
  end if;
  if p_action<>'start' then return denied||jsonb_build_object('state','prepared','reason','event_broadcast_not_started'); end if;
  if e.status not in('scheduled','live_now') or e.management_status='no_show' or e.ends_at is null
    or not isfinite(e.ends_at) or e.ends_at<=clock_timestamp()
  then return denied||jsonb_build_object('reason','event_broadcast_event_closed'); end if;
  if not exists(select 1 from public.paid_creator_events where creator_event_id=e.id and status in('sandbox','active','sold_out','paused'))
    and not exists(select 1 from public.paid_creator_event_passes where creator_event_id=e.id)
  then return denied||jsonb_build_object('reason','event_broadcast_ticketed_source_required'); end if;
  if not exists(select 1 from private.creator_event_broadcast_worker_health where singleton and expires_at>clock_timestamp())
  then return denied||jsonb_build_object('reason','event_broadcast_worker_not_ready'); end if;
  select * into approval from private.creator_event_broadcast_approvals where creator_id=e.host_user_id
    and (creator_event_id is null or creator_event_id=e.id) and revoked_at is null and expires_at>clock_timestamp()
    order by (creator_event_id is not null) desc,created_at desc limit 1;
  if approval.id is null then return denied||jsonb_build_object('reason','event_broadcast_approval_required'); end if;
  select x.* into assignment from public.livekit_room_assignments x join public.livekit_servers s on s.id=x.assigned_server_id
    where x.app_room_id=p.party_id and x.livekit_room_name=p.party_id and x.assignment_status in('assigned','active') and x.ended_at is null
      and x.room_type='live_stage' and s.status='active' order by x.created_at desc limit 1;
  if assignment.id is null then return denied||jsonb_build_object('reason','event_broadcast_assignment_required'); end if;
  return jsonb_build_object('allowed',true,'canStart',true,'reason','event_broadcast_start_ready','state','prepared',
    'eventId',e.id,'hostId',e.host_user_id,'creatorSessionId',p_session_id,'roomId',p.party_id,'broadcastId',p.broadcast_session_id,
    'serverId',assignment.assigned_server_id,'assignmentId',assignment.id,'livekitRoomName',assignment.livekit_room_name,
    'privateOrigin',approval.private_origin,'approvalId',approval.id,
    'approval',jsonb_build_object('rightsStatus',approval.rights_status,'maxMinutes',approval.max_minutes,'expiresAt',approval.expires_at));
end;
$$;
revoke all on function public.read_creator_event_broadcast_producer_authority(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.read_creator_event_broadcast_producer_authority(uuid,uuid,uuid,text) to service_role;

create function public.claim_creator_event_broadcast_start(p_creator_event_id uuid,p_user_id uuid,p_session_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare snapshot jsonb;a private.creator_event_broadcast_attempts; approval private.creator_event_broadcast_approvals;
  e public.creator_events; attempt uuid:=gen_random_uuid();started timestamptz:=clock_timestamp();
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  select * into e from public.creator_events where id=p_creator_event_id for update;
  snapshot:=public.read_creator_event_broadcast_producer_authority(p_creator_event_id,p_user_id,p_session_id,'start');
  if snapshot->>'allowed'<>'true' or snapshot->>'canStart'<>'true' then return snapshot||jsonb_build_object('claimed',false); end if;
  select * into approval from private.creator_event_broadcast_approvals where id=(snapshot->>'approvalId')::uuid for update;
  if approval.revoked_at is not null or approval.expires_at<=clock_timestamp() then raise exception 'event_broadcast_approval_required'; end if;
  insert into private.creator_event_broadcast_attempts(id,creator_event_id,creator_id,creator_session_id,party_id,broadcast_session_id,
    approval_id,assignment_id,server_id,livekit_room_name,rights_status,private_origin,max_minutes,approval_expires_at,
    output_prefix,state,started_at,stop_at)
  values(attempt,e.id,e.host_user_id,p_session_id,snapshot->>'roomId',(snapshot->>'broadcastId')::uuid,
    approval.id,(snapshot->>'assignmentId')::uuid,(snapshot->>'serverId')::uuid,snapshot->>'livekitRoomName',approval.rights_status,
    approval.private_origin,approval.max_minutes,approval.expires_at,'creator-events/'||(snapshot->>'broadcastId')||'/'||attempt::text,
    'starting',started,least(started+make_interval(mins=>approval.max_minutes),e.ends_at,approval.expires_at)) returning * into a;
  insert into private.creator_event_broadcast_stop_jobs(attempt_id,due_at,reason)
    values(a.id,least(a.stop_at,started+interval '30 seconds'),'startup_receipt_required');
  return private.creator_event_broadcast_attempt_row(a)||jsonb_build_object('allowed',true,'claimed',true,'reason','start_claimed');
end;
$$;
revoke all on function public.claim_creator_event_broadcast_start(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.claim_creator_event_broadcast_start(uuid,uuid,uuid) to service_role;

create function private.queue_creator_event_broadcast_stop(p_attempt_id uuid,p_reason text,p_due_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
begin
  insert into private.creator_event_broadcast_stop_jobs(attempt_id,due_at,reason)
  values(p_attempt_id,p_due_at,p_reason)
  on conflict(attempt_id) do update set due_at=least(creator_event_broadcast_stop_jobs.due_at,excluded.due_at),
    reason=excluded.reason,state=case when creator_event_broadcast_stop_jobs.state='complete' then 'pending' else creator_event_broadcast_stop_jobs.state end;
  update public.room_broadcast_sessions b set is_spectator_playback_enabled=false,broadcast_status='stopping_later'
  from private.creator_event_broadcast_attempts a where a.id=p_attempt_id and b.id=a.broadcast_session_id;
  update public.spectator_hls_playback_records h set is_spectator_playback_enabled=false,playback_status='disabled'
  from private.creator_event_broadcast_attempts a where a.id=p_attempt_id and h.broadcast_session_id=a.broadcast_session_id;
end;
$$;
revoke all on function private.queue_creator_event_broadcast_stop(uuid,text,timestamptz) from public,anon,authenticated,service_role;

create function public.record_creator_event_broadcast_provider(p_creator_event_id uuid,p_user_id uuid,p_session_id uuid,
  p_attempt_id uuid,p_egress_id text,p_provider_status text,p_source_url text,p_playlist_path text,
  p_private_origin_verified boolean,p_provider_binding_verified boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.creator_event_broadcast_attempts;e public.creator_events;approval private.creator_event_broadcast_approvals;
  provider_status text:=upper(coalesce(p_provider_status,''));current_authority boolean;v_reason text;now_at timestamptz:=clock_timestamp();
  replay_allowed boolean;playback_id uuid;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  select * into e from public.creator_events where id=p_creator_event_id for update;
  select * into a from private.creator_event_broadcast_attempts where id=p_attempt_id and creator_event_id=p_creator_event_id for update;
  if a.id is null or a.creator_id is distinct from p_user_id or a.creator_session_id is distinct from p_session_id
    or provider_status not in('STARTING','ACTIVE','ENDING','COMPLETE','FAILED','ABORTED','UNKNOWN')
    or (p_egress_id is not null and p_egress_id!~'^EG_[A-Za-z0-9_-]+$')
    or (a.egress_id is not null and p_egress_id is not null and a.egress_id<>p_egress_id)
  then raise exception 'event_broadcast_receipt_binding_invalid'; end if;
  if provider_status<>'UNKNOWN' and (p_egress_id is null or p_provider_binding_verified is distinct from true)
  then raise exception 'event_broadcast_provider_binding_required'; end if;
  insert into private.creator_event_broadcast_provider_receipts(attempt_id,provider_status,egress_id,private_origin_verified,binding_verified)
  values(a.id,provider_status,p_egress_id,coalesce(p_private_origin_verified,false),coalesce(p_provider_binding_verified,false));
  if a.state in('stopped','failed') then return private.creator_event_broadcast_attempt_row(a)||jsonb_build_object('recorded',true); end if;
  update private.creator_event_broadcast_attempts set egress_id=coalesce(egress_id,p_egress_id),updated_at=now_at where id=a.id returning * into a;
  if provider_status in('COMPLETE','FAILED','ABORTED') then
    update private.creator_event_broadcast_attempts set state=case when provider_status='COMPLETE' then 'stopped' else 'failed' end,
      reason='provider_'||lower(provider_status),updated_at=now_at where id=a.id returning * into a;
    update private.creator_event_broadcast_stop_jobs set state='complete',lease_expires_at=null where attempt_id=a.id;
    update public.room_broadcast_sessions set broadcast_status=case when provider_status='COMPLETE' then 'ended' else 'failed_later' end,
      egress_status=case when provider_status='COMPLETE' then 'stopped_later' else 'failed_later' end,
      ended_at=now_at,is_spectator_playback_enabled=false where id=a.broadcast_session_id;
    update public.spectator_hls_playback_records set playback_status=case when provider_status='COMPLETE' then 'ended' else 'failed' end,
      is_spectator_playback_enabled=false where broadcast_session_id=a.broadcast_session_id;
    select * into approval from private.creator_event_broadcast_approvals where id=a.approval_id;
    replay_allowed:=provider_status='COMPLETE' and p_private_origin_verified is true and p_provider_binding_verified is true
      and p_playlist_path=a.output_prefix||'/index.m3u8' and p_source_url=a.private_origin||'/'||a.output_prefix||'/index.m3u8'
      and e.status not in('canceled','expired') and e.management_status is distinct from 'no_show'
      and approval.revoked_at is null and (
        e.replay_policy='indefinite' or (e.replay_policy='until_expiration' and e.replay_expires_at>now_at)
        or exists(select 1 from public.event_ticket_reservations reservation
          join public.creator_event_offer_revisions terms on terms.id=reservation.revision_id
          join public.paid_creator_event_passes pass on pass.access_grant_id=reservation.access_grant_id
          where reservation.creator_event_id=e.id and reservation.state='fulfilled' and pass.status='active'
            and pass.refunded_at is null and pass.revoked_at is null
            and (terms.terms->>'replayPolicy'='indefinite' or (terms.terms->>'replayPolicy'='until_expiration'
              and (terms.terms->>'replayExpiresAt')::timestamptz>now_at))));
    if coalesce(replay_allowed,false) then
      update public.room_broadcast_sessions set egress_provider='livekit_egress_later',egress_id=a.egress_id,
        hls_playback_url=p_source_url,playback_url_status='event_ticketed_available',rights_status=a.rights_status,
        access_type='ticketed',is_publicly_watchable=false,is_spectator_playback_enabled=true,requires_premium=false,requires_ticket=true,
        metadata=metadata||jsonb_build_object('event_ticketed_approved',true,'producer_attempt_id',a.id,
          'private_origin_verified',true,'provider_binding_verified',true,'replay_receipt_verified',true)
      where id=a.broadcast_session_id;
      insert into public.spectator_hls_playback_records(broadcast_session_id,source_room_id,watch_party_room_id,creator_event_id,
        host_user_id,channel_user_id,visibility,playback_status,playlist_path,rights_status,access_type,
        is_publicly_watchable,is_spectator_playback_enabled,requires_premium,requires_ticket,metadata)
      values(a.broadcast_session_id,a.party_id,a.party_id,e.id::text,a.creator_id::text,a.creator_id::text,'private','ended',
        p_playlist_path,a.rights_status,'ticketed',false,true,false,true,jsonb_build_object('producer_attempt_id',a.id))
      on conflict(broadcast_session_id) do update set playback_status='ended',playlist_path=excluded.playlist_path,
        is_spectator_playback_enabled=true,rights_status=excluded.rights_status,access_type='ticketed',requires_premium=false,requires_ticket=true
      returning id into playback_id;
      insert into public.creator_replay_library_items(owner_user_id,source_type,source_room_id,party_id,broadcast_session_id,
        title,visibility,rights_status,save_status,playback_record_id,moderation_status,money_status,metadata)
      values(a.creator_id::text,'creator_event',a.party_id,a.party_id,a.broadcast_session_id,e.event_title,
        'ticketed',a.rights_status,'ready',playback_id,'clean','paid',jsonb_build_object('producer_attempt_id',a.id))
      on conflict(broadcast_session_id) where broadcast_session_id is not null do update set
        source_type='creator_event',source_room_id=excluded.source_room_id,party_id=excluded.party_id,
        visibility='ticketed',rights_status=excluded.rights_status,save_status='ready',playback_record_id=excluded.playback_record_id,
        money_status='paid',metadata=excluded.metadata;
    end if;
    return private.creator_event_broadcast_attempt_row(a)||jsonb_build_object('recorded',true);
  end if;
  select * into approval from private.creator_event_broadcast_approvals where id=a.approval_id;
  current_authority:=e.id is not null and e.host_user_id=a.creator_id and e.status in('scheduled','live_now')
    and e.management_status is distinct from 'no_show' and e.ends_at>now_at and a.stop_at>now_at
    and approval.revoked_at is null and approval.expires_at>now_at
    and private.creator_event_broadcast_actor_current(a.creator_id,a.creator_session_id,a.party_id,true)
    and exists(select 1 from private.creator_event_broadcast_worker_health where singleton and expires_at>now_at);
  if provider_status='ACTIVE' and current_authority and a.state<>'stopping' then
    if p_private_origin_verified is distinct from true or p_playlist_path is distinct from a.output_prefix||'/live.m3u8'
      or p_source_url is distinct from a.private_origin||'/'||a.output_prefix||'/live.m3u8'
    then
      v_reason:='event_broadcast_private_origin_proof_required';
    else
      update public.room_broadcast_sessions set broadcast_status='active_later',egress_provider='livekit_egress_later',
        egress_status='active_later',egress_id=a.egress_id,hls_playback_url=p_source_url,playback_url_status='event_ticketed_available',
        rights_status=a.rights_status,access_type='ticketed',is_publicly_watchable=false,is_spectator_playback_enabled=true,
        requires_premium=false,requires_ticket=true,max_broadcast_minutes=a.max_minutes,cost_guard_status='within_cap_later',
        started_at=a.started_at,metadata=metadata||jsonb_build_object('event_ticketed_approved',true,'producer_attempt_id',a.id,
          'private_origin_verified',true,'provider_binding_verified',true) where id=a.broadcast_session_id;
      insert into public.spectator_hls_playback_records(broadcast_session_id,source_room_id,watch_party_room_id,creator_event_id,
        host_user_id,channel_user_id,visibility,playback_status,playlist_path,rights_status,access_type,
        is_publicly_watchable,is_spectator_playback_enabled,requires_premium,requires_ticket,metadata)
      values(a.broadcast_session_id,a.party_id,a.party_id,a.creator_event_id::text,a.creator_id::text,a.creator_id::text,'private','live',
        p_playlist_path,a.rights_status,'ticketed',false,true,false,true,jsonb_build_object('producer_attempt_id',a.id))
      on conflict(broadcast_session_id) do update set playback_status='live',playlist_path=excluded.playlist_path,
        is_spectator_playback_enabled=true,rights_status=excluded.rights_status,access_type='ticketed',requires_premium=false,requires_ticket=true;
      update private.creator_event_broadcast_attempts set state='active',reason=null,updated_at=now_at where id=a.id returning * into a;
      update private.creator_event_broadcast_stop_jobs set due_at=a.stop_at,state='pending',lease_expires_at=null,reason='approved_cost_deadline' where attempt_id=a.id;
      return private.creator_event_broadcast_attempt_row(a)||jsonb_build_object('recorded',true);
    end if;
  elsif provider_status='STARTING' and current_authority and a.state='starting' then
    return private.creator_event_broadcast_attempt_row(a)||jsonb_build_object('recorded',true);
  else v_reason:=case when not current_authority then 'event_broadcast_authority_lost' else 'event_broadcast_'||lower(provider_status) end;
  end if;
  update private.creator_event_broadcast_attempts set state=case when provider_status='UNKNOWN' then 'uncertain' else 'stopping' end,
    reason=v_reason,updated_at=now_at where id=a.id returning * into a;
  perform private.queue_creator_event_broadcast_stop(a.id,coalesce(v_reason,'event_broadcast_reconciliation_required'),now_at);
  return private.creator_event_broadcast_attempt_row(a)||jsonb_build_object('recorded',true,'needsStop',true);
end;
$$;
revoke all on function public.record_creator_event_broadcast_provider(uuid,uuid,uuid,uuid,text,text,text,text,boolean,boolean) from public,anon,authenticated,service_role;
grant execute on function public.record_creator_event_broadcast_provider(uuid,uuid,uuid,uuid,text,text,text,text,boolean,boolean) to service_role;

create function public.claim_due_creator_event_broadcast_stops(p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.creator_event_broadcast_attempts;job private.creator_event_broadcast_stop_jobs;result jsonb:='[]';
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  -- Expired/revoked approval, closed room or lost creator authority accelerates
  -- the existing stop job even when no app is connected or sending refreshes.
  for a in select * from private.creator_event_broadcast_attempts where state in('starting','active','uncertain','stopping') loop
    if not exists(select 1 from public.creator_events e join private.creator_event_broadcast_approvals approval on approval.id=a.approval_id
      where e.id=a.creator_event_id and e.status in('scheduled','live_now') and e.management_status is distinct from 'no_show'
        and e.ends_at>clock_timestamp() and approval.revoked_at is null and approval.expires_at>clock_timestamp())
      or not private.creator_event_broadcast_actor_current(a.creator_id,a.creator_session_id,a.party_id,true)
    then perform private.queue_creator_event_broadcast_stop(a.id,'event_broadcast_authority_lost',clock_timestamp()); end if;
  end loop;
  for job in select * from private.creator_event_broadcast_stop_jobs where due_at<=clock_timestamp()
    and (state='pending' or (state='leased' and lease_expires_at<=clock_timestamp()))
    order by due_at,attempt_id limit greatest(1,least(coalesce(p_limit,20),100)) for update skip locked
  loop
    select * into a from private.creator_event_broadcast_attempts where id=job.attempt_id;
    if a.state in('stopped','failed') then update private.creator_event_broadcast_stop_jobs set state='complete' where attempt_id=a.id;continue;end if;
    update private.creator_event_broadcast_stop_jobs set state='leased',lease_expires_at=clock_timestamp()+interval '60 seconds',claims=claims+1 where attempt_id=a.id;
    update private.creator_event_broadcast_attempts set state='stopping',reason=job.reason,updated_at=clock_timestamp() where id=a.id returning * into a;
    result:=result||jsonb_build_array(private.creator_event_broadcast_attempt_row(a)||jsonb_build_object('stopReason',job.reason));
  end loop;
  return result;
end;
$$;
revoke all on function public.claim_due_creator_event_broadcast_stops(integer) from public,anon,authenticated,service_role;
grant execute on function public.claim_due_creator_event_broadcast_stops(integer) to service_role;

create function private.queue_creator_event_broadcast_lifecycle_stop()
returns trigger language plpgsql security definer set search_path='' as $$
declare a private.creator_event_broadcast_attempts;
begin
  if new.status in('ended','canceled','expired') or new.management_status='no_show' then
    select * into a from private.creator_event_broadcast_attempts where creator_event_id=new.id and state in('starting','active','uncertain','stopping');
    if a.id is not null then perform private.queue_creator_event_broadcast_stop(a.id,'event_lifecycle_'||new.status,clock_timestamp()); end if;
  end if;
  return new;
end;
$$;
create trigger queue_creator_event_broadcast_lifecycle_stop after update of status,management_status on public.creator_events
for each row execute function private.queue_creator_event_broadcast_lifecycle_stop();
revoke all on function private.queue_creator_event_broadcast_lifecycle_stop() from public,anon,authenticated,service_role;

create function public.revoke_creator_event_broadcast_approval(p_approval_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare a private.creator_event_broadcast_attempts;
begin
  if auth.role()<>'authenticated' or not public.whole_app_exact_current_session_authority_internal()
    or not public.has_platform_role(array['owner','operator']) then raise exception 'event_broadcast_operator_required'; end if;
  update private.creator_event_broadcast_approvals set revoked_at=clock_timestamp() where id=p_approval_id and revoked_at is null;
  for a in select * from private.creator_event_broadcast_attempts where approval_id=p_approval_id and state in('starting','active','uncertain','stopping') loop
    perform private.queue_creator_event_broadcast_stop(a.id,'event_broadcast_approval_revoked',clock_timestamp());
  end loop;
end;
$$;
revoke all on function public.revoke_creator_event_broadcast_approval(uuid) from public,anon,authenticated,service_role;
grant execute on function public.revoke_creator_event_broadcast_approval(uuid) to authenticated;
