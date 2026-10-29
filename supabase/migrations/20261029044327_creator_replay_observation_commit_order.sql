-- Source writes finish before replay observations serialize. AFTER row triggers
-- cannot acquire an observation lock before the row being changed is locked.
-- Queue distinct event IDs and flush them in event order at transaction commit.
-- Only the committed final state is observed: intermediate states in a provider
-- transaction were never visible to buyers. Historical facts and cutover times
-- remain immutable, and eager buyer policy evaluation remains available.
create table private.creator_event_replay_observation_pending (
  transaction_id bigint not null,
  event_id uuid not null,
  primary key(transaction_id,event_id)
);
-- This transaction-local work queue deliberately has no event foreign key:
-- source writers must not acquire a parent lock while holding child rows.
alter table private.creator_event_replay_observation_pending enable row level security;
alter table private.creator_event_replay_observation_pending force row level security;
revoke all on private.creator_event_replay_observation_pending from public,anon,authenticated,service_role;

create function private.flush_creator_event_replay_observations()
returns trigger language plpgsql security definer set search_path='' as $$
declare pending_event uuid;
begin
  -- The first deferred invocation drains the complete transaction set. Later
  -- invocations see an empty set. Rollback removes queued rows with their writes.
  for pending_event in select event_id from private.creator_event_replay_observation_pending
    where transaction_id=pg_catalog.txid_current() order by event_id
  loop
    perform private.capture_creator_event_replay_availability(pending_event);
  end loop;
  delete from private.creator_event_replay_observation_pending
    where transaction_id=pg_catalog.txid_current();
  return null;
end;
$$;
revoke all on function private.flush_creator_event_replay_observations() from public,anon,authenticated,service_role;
create constraint trigger creator_event_replay_observation_commit
  after insert on private.creator_event_replay_observation_pending
  deferrable initially deferred for each row
  execute function private.flush_creator_event_replay_observations();

create or replace function private.record_creator_event_replay_availability()
returns trigger language plpgsql security definer set search_path='' as $$
declare row_data jsonb;event_id uuid;seen uuid[]:='{}';
begin
  for row_data in select value from jsonb_array_elements(jsonb_build_array(to_jsonb(old),to_jsonb(new))) where value<>'null'::jsonb loop
    event_id:=null;
    if tg_table_name='creator_events' then event_id:=(row_data->>'id')::uuid;
    elsif tg_table_name='creator_event_broadcast_provider_receipts' then
      select creator_event_id into event_id from private.creator_event_broadcast_attempts where id=(row_data->>'attempt_id')::uuid;
    elsif tg_table_name='creator_replay_library_items' then
      select b.creator_event_id::uuid into event_id from public.room_broadcast_sessions b
        where b.id=(row_data->>'broadcast_session_id')::uuid and b.creator_event_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    elsif row_data->>'creator_event_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then event_id:=(row_data->>'creator_event_id')::uuid;
    end if;
    if event_id is not null and not event_id=any(seen) then
      insert into private.creator_event_replay_observation_pending(transaction_id,event_id)
        values(pg_catalog.txid_current(),event_id) on conflict do nothing;
      seen:=array_append(seen,event_id);
    end if;
  end loop;
  return coalesce(new,old);
end;
$$;

create or replace function public.read_my_creator_purchases(
  p_limit integer default 50,p_before_created_at timestamptz default null,p_before_id uuid default null,
  p_source_type text default null,p_source_id uuid default null
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare page jsonb;item jsonb;items jsonb:='[]'::jsonb;policy jsonb;
begin
  page:=public.read_my_creator_purchases_pre_event_remedies(p_limit,p_before_created_at,p_before_id,p_source_type,p_source_id);
  if auth.uid() is null or page->>'userId' is distinct from auth.uid()::text then raise exception 'buyer_purchase_history_authority_required'; end if;
  -- Multiple wallet events are locked in canonical order to avoid inverted
  -- buyer purchase histories acquiring the same event rows in opposite order.
  perform 1 from public.creator_events e where e.id in(select (value->>'sourceId')::uuid
    from jsonb_array_elements(page->'items') where value->>'sourceType'='event' and value->>'sourceId' is not null)
    order by e.id for update;
  -- Eager buyer reads can visit page items in purchase order. Acquire every
  -- observation advisory in event order first, matching deferred source batches.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'creator-event-replay-observation:'||e.id::text,0))
    from public.creator_events e where e.id in(select (value->>'sourceId')::uuid
      from jsonb_array_elements(page->'items') where value->>'sourceType'='event' and value->>'sourceId' is not null)
    order by e.id;
  for item in select value from jsonb_array_elements(page->'items') loop
    policy:=null;
    if item->>'sourceType'='event' and item->>'sourceId' is not null
      and exists(select 1 from public.creator_events where id=(item->>'sourceId')::uuid) then
      policy:=private.creator_event_ticket_policy((item->>'sourceId')::uuid,(item->>'id')::uuid,item);
    end if;
    items:=items||jsonb_build_array(item||jsonb_build_object('refundEligibility',policy->'refundEligibility',
      'eventScheduleChange',case when policy is null then null else jsonb_build_object(
        'revisionId',policy->'currentRevision'->'id','choiceRequired',policy->'choiceRequired',
        'acceptedRevisionId',policy->'acceptedRevisionId','notice',policy->'notice') end));
  end loop;
  return jsonb_set(page,'{items}',items);
end;
$$;

create or replace function public.record_creator_event_broadcast_provider(p_creator_event_id uuid,p_user_id uuid,p_session_id uuid,
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
  -- Direct creator replay edits own this row before the shared media-retention
  -- guard runs. Lock an existing replay before any public source write, so a
  -- provider cannot own that guard while waiting for the creator's replay row.
  perform 1 from public.creator_replay_library_items
    where broadcast_session_id=a.broadcast_session_id order by id for update;
  -- All provider branches lock the stop job before broadcast/playback rows.
  -- This matches queueing and avoids ACTIVE's former broadcast -> job inversion.
  perform 1 from private.creator_event_broadcast_stop_jobs where attempt_id=a.id for update;
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

create or replace function public.claim_due_creator_event_broadcast_stops(p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.creator_event_broadcast_attempts;job private.creator_event_broadcast_stop_jobs;result jsonb:='[]';
  locked_attempts uuid[];
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  -- Lock each candidate attempt before any stop job. A concurrent provider
  -- owns the attempt first; SKIP LOCKED leaves its work for the next poll.
  select coalesce(array_agg(candidate.id),'{}'::uuid[]) into locked_attempts from (
    select attempt.id from private.creator_event_broadcast_attempts attempt
    where attempt.state in('starting','active','uncertain','stopping')
      or exists(select 1 from private.creator_event_broadcast_stop_jobs pending
        where pending.attempt_id=attempt.id and pending.due_at<=clock_timestamp()
          and (pending.state='pending' or (pending.state='leased' and pending.lease_expires_at<=clock_timestamp())))
    order by attempt.creator_event_id,attempt.id for update skip locked
  ) candidate;
  -- Acquire the whole job set canonically before either processing pass.
  -- The lease pass retains due-time priority after these locks are held.
  perform 1 from private.creator_event_broadcast_stop_jobs pending
    join private.creator_event_broadcast_attempts attempt on attempt.id=pending.attempt_id
    where attempt.id=any(locked_attempts)
    order by attempt.creator_event_id,attempt.id for update of pending;
  -- Expired/revoked approval, closed room or lost creator authority accelerates
  -- the existing stop job even when no app is connected or sending refreshes.
  for a in select * from private.creator_event_broadcast_attempts
    where id=any(locked_attempts) and state in('starting','active','uncertain','stopping')
    order by creator_event_id,id loop
    if not exists(select 1 from public.creator_events e join private.creator_event_broadcast_approvals approval on approval.id=a.approval_id
      where e.id=a.creator_event_id and e.status in('scheduled','live_now') and e.management_status is distinct from 'no_show'
        and e.ends_at>clock_timestamp() and approval.revoked_at is null and approval.expires_at>clock_timestamp())
      or not private.creator_event_broadcast_actor_current(a.creator_id,a.creator_session_id,a.party_id,true)
    then perform private.queue_creator_event_broadcast_stop(a.id,'event_broadcast_authority_lost',clock_timestamp()); end if;
  end loop;
  for job in select * from private.creator_event_broadcast_stop_jobs
    where attempt_id=any(locked_attempts) and due_at<=clock_timestamp()
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

create or replace function public.revoke_creator_event_broadcast_approval(p_approval_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare a private.creator_event_broadcast_attempts;
begin
  if auth.role()<>'authenticated' or not public.whole_app_exact_current_session_authority_internal()
    or not public.has_platform_role(array['owner','operator']) then raise exception 'event_broadcast_operator_required'; end if;
  update private.creator_event_broadcast_approvals set revoked_at=clock_timestamp() where id=p_approval_id and revoked_at is null;
  -- A creator-wide approval can cover several events. Own every affected job
  -- before the first public playback write acquires the media-retention guard.
  perform 1 from private.creator_event_broadcast_stop_jobs job
    join private.creator_event_broadcast_attempts attempt on attempt.id=job.attempt_id
    where attempt.approval_id=p_approval_id and attempt.state in('starting','active','uncertain','stopping')
    order by attempt.creator_event_id,attempt.id for update of job;
  for a in select * from private.creator_event_broadcast_attempts where approval_id=p_approval_id and state in('starting','active','uncertain','stopping')
    order by creator_event_id,id loop
    perform private.queue_creator_event_broadcast_stop(a.id,'event_broadcast_approval_revoked',clock_timestamp());
  end loop;
end;
$$;

-- Keep the existing lifecycle authority and immutable-term checks; acquire
-- stop jobs before notification, offer, or playback side effects can take the
-- shared media-retention guard. Managed RPCs and direct event writes both use it.
create or replace function private.guard_creator_event_lifecycle()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_has_purchase boolean; v_contract_changed boolean; v_permit boolean;
begin
  if not coalesce(isfinite(new.starts_at),true) or not coalesce(isfinite(new.ends_at),true)
    or not coalesce(isfinite(new.replay_available_at),true) or not coalesce(isfinite(new.replay_expires_at),true)
  then raise exception 'event_finite_schedule_required'; end if;
  if auth.uid() is not null and (not public.wave1_current_caller_authority_internal()
    or auth.uid() is distinct from new.host_user_id or public.is_account_access_restricted(auth.uid()::text))
  then raise exception 'event_creator_session_required'; end if;
  if tg_op='INSERT' and auth.uid() is not null and (new.management_status is not null or new.status_message is not null)
  then raise exception 'event_lifecycle_management_required'; end if;
  if tg_op='UPDATE' and new.host_user_id is distinct from old.host_user_id then raise exception 'event_host_immutable'; end if;
  if new.status='live_now' and (tg_op='INSERT' or old.status is distinct from 'live_now') then
    if not exists(select 1 from public.creator_event_broadcast_ready_internal(new.id,new.host_user_id,false))
    then raise exception 'event_verified_broadcast_required'; end if;
  end if;
  if tg_op='UPDATE' then
    select exists(select 1 from private.creator_event_lifecycle_permits p
      where p.transaction_id=txid_current() and p.event_id=new.id and p.actor_id=auth.uid()) into v_permit;
    if auth.uid() is not null and row(new.management_status,new.status_message)
      is distinct from row(old.management_status,old.status_message) and not v_permit
    then raise exception 'event_lifecycle_management_required'; end if;
    v_contract_changed:=row(new.starts_at,new.ends_at,new.time_zone,new.replay_policy,new.replay_available_at,new.replay_expires_at)
      is distinct from row(old.starts_at,old.ends_at,old.time_zone,old.replay_policy,old.replay_available_at,old.replay_expires_at);
    select exists(select 1 from public.paid_creator_event_passes p where p.creator_event_id=new.id
      and p.refunded_at is null and p.revoked_at is null and p.status in ('active','expired'))
      or exists(select 1 from public.event_ticket_reservations r where r.creator_event_id=new.id) into v_has_purchase;
    -- Every status transition for a reserved or purchased event belongs to the
    -- managed lifecycle. A legacy editor must not hide the show as draft,
    -- finish it before it starts, or reopen a cancellation without its checks.
    if v_has_purchase and (v_contract_changed or new.status is distinct from old.status) then
      if not v_permit then raise exception 'purchased_event_lifecycle_management_required'; end if;
      if row(new.replay_policy,new.replay_available_at,new.replay_expires_at)
        is distinct from row(old.replay_policy,old.replay_available_at,old.replay_expires_at)
      then raise exception 'purchased_event_replay_terms_immutable'; end if;
    end if;
    if new.status in('ended','canceled','expired') or new.management_status='no_show' then
      -- The AFTER notification trigger can write media-guarded activity rows
      -- before the AFTER lifecycle trigger queues these jobs. Own jobs first,
      -- matching provider/worker/revocation job -> media order.
      perform 1 from private.creator_event_broadcast_stop_jobs job
        join private.creator_event_broadcast_attempts attempt on attempt.id=job.attempt_id
        where attempt.creator_event_id=new.id and attempt.state in('starting','active','uncertain','stopping')
        order by attempt.id for update of job;
    end if;
    if v_contract_changed then
      update public.paid_creator_events set sales_paused=true,updated_at=clock_timestamp()
        where creator_event_id=new.id and status in ('active','sandbox','sold_out','paused');
    end if;
  end if;
  return new;
end;
$$;
