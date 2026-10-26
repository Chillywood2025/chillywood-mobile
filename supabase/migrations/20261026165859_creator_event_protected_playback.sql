-- Exact, watch-only event delivery. This does not enable a provider, publish a
-- stream or make a paid record public. Egress approval remains restricted to
-- the existing trusted service/operator boundary, never ordinary creators.
set check_function_bodies = false;

alter table public.creator_replay_library_items drop constraint creator_replay_library_items_source_type_check;
alter table public.creator_replay_library_items add constraint creator_replay_library_items_source_type_check
  check(source_type in('live_stage','watch_party_live','creator_event'));
alter table public.creator_replay_library_items drop constraint creator_replay_library_items_visibility_check;
alter table public.creator_replay_library_items add constraint creator_replay_library_items_visibility_check
  check(visibility in('draft','circle','public','ticketed'));
alter table public.creator_replay_library_items add constraint creator_replay_ticketed_event_check
  check(visibility<>'ticketed' or (source_type='creator_event' and money_status='paid'));

create function private.guard_ticketed_event_replay_identity()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if auth.role()='authenticated' and old.source_type='creator_event' and (
    row(new.owner_user_id,new.source_type,new.source_room_id,new.broadcast_session_id,new.playback_record_id,new.money_status)
      is distinct from row(old.owner_user_id,old.source_type,old.source_room_id,old.broadcast_session_id,old.playback_record_id,old.money_status)
    or (old.money_status='paid' and new.visibility not in('draft','ticketed')))
  then raise exception 'event_replay_identity_immutable'; end if;
  return new;
end;
$$;
revoke all on function private.guard_ticketed_event_replay_identity() from public,anon,authenticated,service_role;
create trigger guard_ticketed_event_replay_identity before update on public.creator_replay_library_items
  for each row execute function private.guard_ticketed_event_replay_identity();

do $migration$
declare c record; allowed text := $predicate$(access_type='ticketed' and requires_ticket
  and not requires_premium and not is_publicly_watchable
  and creator_event_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and host_user_id is not null and source_room_id is not null
  and lower(source_room_id) not like 'd7d_test_%' and lower(source_room_id) not like 'd7e_%'
  and rights_status in('creator_owned','chillywood_original','licensed_for_public_stream')
  and playback_url_status='event_ticketed_available'
  and metadata->>'event_ticketed_approved'='true'
  and nullif(egress_id,'') is not null and hls_playback_url ~ '^https://[^[:space:]]+\.m3u8([?][^[:space:]]*)?$')$predicate$;
begin
  -- Preserve every existing public/Circle/proof predicate verbatim, adding only
  -- the separately authorized ticketed lane. Ordinary creators cannot approve it.
  for c in select conname,pg_get_expr(conbin,conrelid) expression from pg_constraint
    where conrelid='public.room_broadcast_sessions'::regclass and conname in(
      'room_broadcast_sessions_playback_url_status_check','room_broadcast_sessions_egress_id_d7d_d7f_guard',
      'room_broadcast_sessions_hls_url_d7d_d7f_guard','room_broadcast_sessions_public_watch_d7f_guard',
      'room_broadcast_sessions_spectator_playback_d7f_guard')
  loop
    execute format('alter table public.room_broadcast_sessions drop constraint %I',c.conname);
    execute format('alter table public.room_broadcast_sessions add constraint %I check ((%s) or ((%s) is true))',c.conname,c.expression,allowed);
  end loop;
end;
$migration$;

create function public.creator_event_broadcast_ready_internal(p_event_id uuid,p_host_id uuid,p_replay boolean default false)
returns table(broadcast_id uuid,record_id uuid,replay_id uuid)
language sql stable security definer set search_path='' as $$
  select b.id,h.id,r.id from public.room_broadcast_sessions b
  join public.creator_events event on event.id=p_event_id and event.host_user_id=p_host_id
  join public.spectator_hls_playback_records h on h.broadcast_session_id=b.id
  left join public.creator_replay_library_items r on p_replay and r.broadcast_session_id=b.id
    and r.playback_record_id=h.id and r.owner_user_id=p_host_id::text
    and r.source_type='creator_event' and r.source_room_id=b.source_room_id
    and r.save_status='ready' and r.moderation_status in('clean','reported')
    and r.rights_status in('creator_owned','chillywood_original','licensed_for_public_stream')
    and r.visibility in('public','circle','ticketed') and r.money_status in('free','paid')
  where b.creator_event_id=p_event_id::text and h.creator_event_id=p_event_id::text
    and b.host_user_id=p_host_id::text and h.host_user_id=p_host_id::text
    and h.source_room_id=b.source_room_id
    and lower(b.source_room_id) not like 'd7d_test_%' and lower(b.source_room_id) not like 'd7e_%'
    and b.rights_status in('creator_owned','chillywood_original','licensed_for_public_stream')
    and h.rights_status=b.rights_status and b.is_spectator_playback_enabled and h.is_spectator_playback_enabled
    and not b.requires_premium and not h.requires_premium and nullif(h.playlist_path,'') is not null
    and b.hls_playback_url ~ '^https://[^[:space:]]+\.m3u8([?][^[:space:]]*)?$'
    and h.playlist_path=regexp_replace(split_part(b.hls_playback_url,'?',1),'^https://[^/]+/','')
    and nullif(b.egress_id,'') is not null
    and (b.access_type='ticketed') = (exists(select 1 from public.paid_creator_events o
      where o.creator_event_id=p_event_id and o.status in('sandbox','active','sold_out','paused','blocked'))
      or exists(select 1 from public.paid_creator_event_passes p where p.creator_event_id=p_event_id))
    and ((not p_replay and b.broadcast_status='active_later' and b.ended_at is null and h.playback_status='live')
      or (p_replay and b.broadcast_status='ended' and h.playback_status='ended' and r.id is not null))
    and (not p_replay or (b.access_type='ticketed' and r.visibility='ticketed' and r.money_status='paid')
      or (b.access_type<>'ticketed' and r.visibility=event.visibility and r.money_status='free'))
    and ((b.access_type='ticketed' and h.access_type='ticketed' and b.requires_ticket and h.requires_ticket
      and not b.is_publicly_watchable and not h.is_publicly_watchable and h.visibility='private'
      and b.playback_url_status='event_ticketed_available' and b.metadata->>'event_ticketed_approved'='true')
    or (b.access_type='public_free' and h.access_type='public_free' and not b.requires_ticket and not h.requires_ticket
      and event.visibility='public'
      and b.is_publicly_watchable and h.is_publicly_watchable and h.visibility='public'
      and b.playback_url_status='public_safe_available' and b.metadata->>'d7f_public_safe_approved'='true')
    or (b.access_type='circle' and h.access_type='circle' and not b.requires_ticket and not h.requires_ticket
      and event.visibility='circle'
      and not b.is_publicly_watchable and not h.is_publicly_watchable and h.visibility='circle'
      and b.playback_url_status='circle_safe_available' and b.metadata->>'circle_spectator_approved'='true'))
  order by b.created_at desc,b.id limit 1;
$$;
revoke all on function public.creator_event_broadcast_ready_internal(uuid,uuid,boolean) from public,anon,authenticated,service_role;

create function public.creator_event_destination_internal(p_creator_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.creator_events; p public.paid_creator_event_passes; identity jsonb; terms jsonb;
  paid boolean; replay boolean; target record; denied jsonb;
begin
  denied:=jsonb_build_object('creatorEventId',p_creator_event_id,'allowed',false,'reason','event_unavailable');
  if not public.whole_app_exact_current_session_authority_internal() then
    return denied||jsonb_build_object('reason','session_authority_not_current'); end if;
  select * into e from public.creator_events where id=p_creator_event_id;
  if e.id is null or not public.can_read_creator_event(e.id,auth.uid())
    or e.status in('draft','canceled','expired') then return denied; end if;
  if public.is_account_access_restricted(e.host_user_id::text)
    or exists(select 1 from public.channel_audience_blocks b where
      (b.channel_user_id=e.host_user_id::text and b.blocked_user_id=auth.uid()::text)
      or (b.channel_user_id=auth.uid()::text and b.blocked_user_id=e.host_user_id::text)) then return denied; end if;
  paid:=exists(select 1 from public.paid_creator_events o where o.creator_event_id=e.id
    and o.status in('sandbox','active','sold_out','paused','blocked'))
    or exists(select 1 from public.paid_creator_event_passes pass where pass.creator_event_id=e.id);
  if paid and auth.uid()<>e.host_user_id then
    if not public.wave1_creator_money_subject_authorized_internal(e.host_user_id) then return denied; end if;
    for p in select * from public.paid_creator_event_passes where creator_event_id=e.id and buyer_id=auth.uid()
      and status='active' and refunded_at is null and revoked_at is null and (expires_at is null or expires_at>now())
      order by created_at desc
    loop
      begin
        identity:=public.creator_money_historical_purchase_identity_internal(auth.uid(),'event_pass',e.id,p.access_grant_id);
      exception when others then identity:=null;
      end;
      exit when identity is not null;
    end loop;
    if identity is null then return denied||jsonb_build_object('reason','event_pass_required'); end if;
    select v.terms into terms from public.access_grants g
      join public.event_ticket_reservations reservation on reservation.purchase_intent_id::text=g.metadata->>'purchase_intent_id'
      join public.creator_event_offer_revisions v on v.id=reservation.revision_id
      where g.id=p.access_grant_id and reservation.buyer_id=auth.uid() and reservation.creator_event_id=e.id;
  end if;
  if e.status='scheduled' then return denied||jsonb_build_object('reason','waiting_for_show'); end if;
  replay:=e.status in('ended','replay_available');
  if e.status<>'live_now' and not replay then return denied; end if;
  if replay then
    -- Historical tickets without an explicit captured replay contract fail
    -- closed; current creator edits cannot create or remove purchased rights.
    if paid and auth.uid()<>e.host_user_id then
      if terms is null or coalesce(terms->>'replayPolicy','none')='none'
        or (nullif(terms->>'replayAvailableAt','')::timestamptz>now())
        or (terms->>'replayPolicy'='until_expiration' and
          (nullif(terms->>'replayExpiresAt','') is null or (terms->>'replayExpiresAt')::timestamptz<=now()))
      then return denied||jsonb_build_object('reason','replay_not_included_or_expired'); end if;
    elsif e.replay_policy='none' or e.replay_available_at>now()
      or (e.replay_policy='until_expiration' and (e.replay_expires_at is null or e.replay_expires_at<=now())) then
      return denied||jsonb_build_object('reason','replay_not_included_or_expired'); end if;
  elsif e.starts_at>now() then return denied||jsonb_build_object('reason','waiting_for_show'); end if;
  select * into target from public.creator_event_broadcast_ready_internal(e.id,e.host_user_id,replay);
  if target.broadcast_id is null then return denied||jsonb_build_object('reason','playback_not_ready'); end if;
  return jsonb_build_object('creatorEventId',e.id,'allowed',true,'reason','event_access_confirmed',
    'itemId',e.id,'kind',case when replay then 'replay' else 'live' end,
    'broadcastId',target.broadcast_id,'recordId',target.record_id,'replayId',target.replay_id);
end;
$$;
revoke all on function public.creator_event_destination_internal(uuid) from public,anon,authenticated,service_role;

create function public.resolve_creator_event_destination(p_creator_event_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select public.creator_event_destination_internal(p_creator_event_id)-'broadcastId'-'recordId'-'replayId';
$$;
revoke all on function public.resolve_creator_event_destination(uuid) from public,anon,authenticated,service_role;
grant execute on function public.resolve_creator_event_destination(uuid) to authenticated;

-- Only the gateway may revalidate a signed playback capability. It includes
-- the exact Auth session, not just a buyer id, and repeats this on every segment.
create function public.read_creator_event_playback_source(p_creator_event_id uuid,p_user_id uuid,p_session_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare claims text:=current_setting('request.jwt.claims',true); result jsonb; url text;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',p_user_id,'session_id',p_session_id)::text,true);
  result:=public.creator_event_destination_internal(p_creator_event_id);
  perform set_config('request.jwt.claims',coalesce(claims,''),true);
  if result->>'allowed'='true' then
    select hls_playback_url into url from public.room_broadcast_sessions where id=(result->>'broadcastId')::uuid;
    result:=result||jsonb_build_object('sourceUrl',url);
  end if;
  return result;
exception when others then
  perform set_config('request.jwt.claims',coalesce(claims,''),true);
  raise;
end;
$$;
revoke all on function public.read_creator_event_playback_source(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_creator_event_playback_source(uuid,uuid,uuid) to service_role;
