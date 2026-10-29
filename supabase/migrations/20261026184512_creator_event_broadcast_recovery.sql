-- A confirmed terminal provider attempt may be replaced for the same show.
-- Preserve every receipt and output identity; uncertainty never permits retry.
-- Old attempts lack an original terms snapshot and are deliberately ineligible.
alter table private.creator_event_broadcast_attempts
  drop constraint creator_event_broadcast_attempts_creator_event_id_key,
  add column generation integer not null default 1 check(generation>0),
  add column event_terms jsonb;
create unique index creator_event_broadcast_attempt_generation
  on private.creator_event_broadcast_attempts(creator_event_id,generation);
create unique index creator_event_broadcast_one_unresolved_attempt
  on private.creator_event_broadcast_attempts(creator_event_id)
  where state in('starting','active','stopping','uncertain');

create or replace function public.read_creator_event_broadcast_producer_authority(p_creator_event_id uuid,p_user_id uuid,p_session_id uuid,p_action text default 'start')
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare e public.creator_events;p private.creator_event_broadcast_preparations;a private.creator_event_broadcast_attempts;
  approval private.creator_event_broadcast_approvals;assignment public.livekit_room_assignments;denied jsonb;terms jsonb;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  denied:=jsonb_build_object('allowed',false,'eventId',p_creator_event_id,'reason','event_broadcast_authority_required');
  if p_action is null or p_action not in('start','refresh','stop') then return denied; end if;
  select * into e from public.creator_events where id=p_creator_event_id;
  select * into p from private.creator_event_broadcast_preparations where creator_event_id=e.id;
  if e.id is null or e.host_user_id is distinct from p_user_id or p.creator_event_id is null
    or p.host_user_id is distinct from p_user_id or not private.creator_event_broadcast_actor_current(p_user_id,p_session_id,p.party_id,p_action='start')
  then return denied; end if;
  select * into a from private.creator_event_broadcast_attempts where creator_event_id=e.id order by generation desc limit 1;
  if a.id is not null and (p_action<>'start' or a.state not in('stopped','failed')) then
    return private.creator_event_broadcast_attempt_row(a)||jsonb_build_object('allowed',true,'reason','existing_attempt','canStart',false);
  end if;
  if p_action<>'start' then return denied||jsonb_build_object('state','prepared','reason','event_broadcast_not_started'); end if;
  if e.status not in('scheduled','live_now') or e.management_status='no_show' or e.ends_at is null
    or not isfinite(e.ends_at) or e.ends_at<=clock_timestamp()
  then return denied||jsonb_build_object('reason','event_broadcast_event_closed'); end if;
  terms:=jsonb_build_object('startsAt',e.starts_at,'endsAt',e.ends_at,'timeZone',e.time_zone,
    'replayPolicy',e.replay_policy,'replayAvailableAt',e.replay_available_at,'replayExpiresAt',e.replay_expires_at,
    'visibility',e.visibility,'eventType',e.event_type);
  if a.id is not null then
    if a.event_terms is null or a.event_terms is distinct from terms or a.stop_at<=clock_timestamp()
    then return denied||jsonb_build_object('reason','event_broadcast_original_terms_required'); end if;
    -- The current replay resolver serves one recording. Do not silently
    -- substitute a restarted fragment for a promised complete-show replay.
    if e.replay_policy<>'none' or exists(select 1 from public.event_ticket_reservations reservation
      join public.creator_event_offer_revisions revision on revision.id=reservation.revision_id
      where reservation.creator_event_id=e.id and revision.terms->>'replayPolicy' in('indefinite','until_expiration'))
    then return denied||jsonb_build_object('reason','event_broadcast_replay_recovery_required'); end if;
    if a.egress_id is null
      or not exists(select 1 from private.creator_event_broadcast_stop_jobs where attempt_id=a.id and state='complete')
      or not exists(select 1 from private.creator_event_broadcast_provider_receipts where attempt_id=a.id
        and egress_id=a.egress_id and binding_verified and provider_status in('COMPLETE','FAILED','ABORTED'))
    then return denied||jsonb_build_object('reason','event_broadcast_terminal_receipt_required'); end if;
  end if;
  if not exists(select 1 from public.paid_creator_events where creator_event_id=e.id and status in('sandbox','active','sold_out','paused'))
    and not exists(select 1 from public.paid_creator_event_passes where creator_event_id=e.id)
  then return denied||jsonb_build_object('reason','event_broadcast_ticketed_source_required'); end if;
  if not exists(select 1 from private.creator_event_broadcast_worker_health where singleton and expires_at>clock_timestamp())
  then return denied||jsonb_build_object('reason','event_broadcast_worker_not_ready'); end if;
  select * into approval from private.creator_event_broadcast_approvals where creator_id=e.host_user_id
    and (creator_event_id is null or creator_event_id=e.id) and revoked_at is null and expires_at>clock_timestamp()
    and (a.id is null or id=a.approval_id)
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

create or replace function public.claim_creator_event_broadcast_start(p_creator_event_id uuid,p_user_id uuid,p_session_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare snapshot jsonb;a private.creator_event_broadcast_attempts;previous private.creator_event_broadcast_attempts;
  approval private.creator_event_broadcast_approvals;e public.creator_events;
  attempt uuid:=gen_random_uuid();started timestamptz:=clock_timestamp();broadcast uuid;terms jsonb;deadline timestamptz;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  -- The event lock serializes both first starts and terminal replacements.
  select * into e from public.creator_events where id=p_creator_event_id for update;
  snapshot:=public.read_creator_event_broadcast_producer_authority(p_creator_event_id,p_user_id,p_session_id,'start');
  if snapshot->>'allowed'<>'true' or snapshot->>'canStart'<>'true' then return snapshot||jsonb_build_object('claimed',false); end if;
  select * into approval from private.creator_event_broadcast_approvals where id=(snapshot->>'approvalId')::uuid for update;
  if approval.revoked_at is not null or approval.expires_at<=clock_timestamp() then raise exception 'event_broadcast_approval_required'; end if;
  select * into previous from private.creator_event_broadcast_attempts where creator_event_id=e.id order by generation desc limit 1 for update;
  terms:=jsonb_build_object('startsAt',e.starts_at,'endsAt',e.ends_at,'timeZone',e.time_zone,
    'replayPolicy',e.replay_policy,'replayAvailableAt',e.replay_available_at,'replayExpiresAt',e.replay_expires_at,
    'visibility',e.visibility,'eventType',e.event_type);
  deadline:=least(started+make_interval(mins=>approval.max_minutes),e.ends_at,approval.expires_at);
  broadcast:=(snapshot->>'broadcastId')::uuid;
  if previous.id is not null then
    -- Recovery never extends the original show's wall-clock cost budget and
    -- cannot reuse an old media identity or replace immutable ticket terms.
    deadline:=least(deadline,previous.stop_at);
    insert into public.room_broadcast_sessions(source_type,source_room_id,watch_party_room_id,creator_event_id,
      host_user_id,channel_user_id,broadcast_status,egress_provider,egress_status,playback_url_status,
      rights_status,access_type,is_publicly_watchable,is_spectator_playback_enabled,requires_premium,requires_ticket,metadata)
    values('creator_event',snapshot->>'roomId',snapshot->>'roomId',e.id::text,e.host_user_id::text,e.host_user_id::text,
      'planned','not_connected','not_connected','not_available','unknown_block_public_spectator','ticketed',false,false,false,true,
      jsonb_build_object('preparation_only',true,'provider_setup_required',true)) returning id into broadcast;
    update private.creator_event_broadcast_preparations set broadcast_session_id=broadcast,prepared_session_id=p_session_id
      where creator_event_id=e.id;
  end if;
  if deadline<=clock_timestamp() then raise exception 'event_broadcast_original_deadline_expired'; end if;
  insert into private.creator_event_broadcast_attempts(id,creator_event_id,creator_id,creator_session_id,party_id,broadcast_session_id,
    approval_id,assignment_id,server_id,livekit_room_name,rights_status,private_origin,max_minutes,approval_expires_at,
    output_prefix,state,started_at,stop_at,generation,event_terms)
  values(attempt,e.id,e.host_user_id,p_session_id,snapshot->>'roomId',broadcast,
    approval.id,(snapshot->>'assignmentId')::uuid,(snapshot->>'serverId')::uuid,snapshot->>'livekitRoomName',approval.rights_status,
    approval.private_origin,approval.max_minutes,approval.expires_at,'creator-events/'||broadcast::text||'/'||attempt::text,
    'starting',started,deadline,coalesce(previous.generation,0)+1,terms) returning * into a;
  insert into private.creator_event_broadcast_stop_jobs(attempt_id,due_at,reason)
    values(a.id,least(a.stop_at,started+interval '30 seconds'),'startup_receipt_required');
  return private.creator_event_broadcast_attempt_row(a)||jsonb_build_object('allowed',true,'claimed',true,'reason','start_claimed');
end;
$$;
revoke all on function public.claim_creator_event_broadcast_start(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.claim_creator_event_broadcast_start(uuid,uuid,uuid) to service_role;
