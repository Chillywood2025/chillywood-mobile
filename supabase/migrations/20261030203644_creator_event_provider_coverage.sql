-- Forward-only authenticated provider facts. No historical timestamp backfill.
-- This is recorded-output interval evidence, NOT a viewer QoE attestation.
create table private.creator_event_provider_coverage_receipts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.creator_events(id),
  attempt_id uuid not null references private.creator_event_broadcast_attempts(id),
  creator_id uuid not null, creator_session_id uuid not null, server_id uuid not null,
  room_name text not null, output_prefix text not null, egress_id text,
  provider_status text not null, private_origin_verified boolean not null,
  binding_verified boolean not null, activation_confirmed boolean not null,
  -- Cancellation/malformed current schedule must not break terminal cleanup.
  event_starts_at timestamptz, event_ends_at timestamptz,
  timing jsonb, received_at timestamptz not null default clock_timestamp()
);
create index creator_event_provider_coverage_event_attempt
  on private.creator_event_provider_coverage_receipts(event_id,attempt_id);
create index creator_event_provider_coverage_attempt_status
  on private.creator_event_provider_coverage_receipts(attempt_id,provider_status);
create index creator_event_broadcast_receipt_attempt_status
  on private.creator_event_broadcast_provider_receipts(attempt_id,provider_status);
alter table private.creator_event_provider_coverage_receipts enable row level security;
alter table private.creator_event_provider_coverage_receipts force row level security;
revoke all on private.creator_event_provider_coverage_receipts from public,anon,authenticated,service_role;
create function private.guard_creator_event_provider_coverage_receipt()
returns trigger language plpgsql set search_path='' as $$ begin
  raise exception 'event_provider_coverage_immutable';
end; $$;
create trigger creator_event_provider_coverage_immutable before update or delete
on private.creator_event_provider_coverage_receipts for each row
execute function private.guard_creator_event_provider_coverage_receipt();
revoke all on function private.guard_creator_event_provider_coverage_receipt() from public,anon,authenticated,service_role;

create function public.record_creator_event_broadcast_provider_coverage(
  p_creator_event_id uuid,p_user_id uuid,p_session_id uuid,p_attempt_id uuid,p_egress_id text,
  p_provider_status text,p_source_url text,p_playlist_path text,p_private_origin_verified boolean,
  p_provider_binding_verified boolean,p_provider_timing jsonb,p_server_id uuid,p_room_name text,p_output_prefix text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.creator_event_broadcast_attempts;e public.creator_events;result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
  -- Same global lock order as the existing playback/stop projector.
  select * into e from public.creator_events where id=p_creator_event_id for update;
  select * into a from private.creator_event_broadcast_attempts
    where id=p_attempt_id and creator_event_id=p_creator_event_id for update;
  if a.id is null or a.server_id is distinct from p_server_id
    or a.livekit_room_name is distinct from p_room_name or a.output_prefix is distinct from p_output_prefix
  then raise exception 'event_provider_coverage_binding_invalid'; end if;
  -- Existing authority checks and projection remain the only playback writer.
  result:=public.record_creator_event_broadcast_provider(p_creator_event_id,p_user_id,p_session_id,p_attempt_id,
    p_egress_id,p_provider_status,p_source_url,p_playlist_path,p_private_origin_verified,p_provider_binding_verified);
  insert into private.creator_event_provider_coverage_receipts(event_id,attempt_id,creator_id,creator_session_id,
    server_id,room_name,output_prefix,egress_id,provider_status,private_origin_verified,binding_verified,
    activation_confirmed,event_starts_at,event_ends_at,timing)
  values(e.id,a.id,a.creator_id,a.creator_session_id,a.server_id,a.livekit_room_name,a.output_prefix,p_egress_id,
    upper(p_provider_status),coalesce(p_private_origin_verified,false),coalesce(p_provider_binding_verified,false),
    upper(p_provider_status)='ACTIVE' and result->>'state'='active',e.starts_at,e.ends_at,p_provider_timing);
  return result;
end; $$;
revoke all on function public.record_creator_event_broadcast_provider_coverage(uuid,uuid,uuid,uuid,text,text,text,text,boolean,boolean,jsonb,uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.record_creator_event_broadcast_provider_coverage(uuid,uuid,uuid,uuid,text,text,text,text,boolean,boolean,jsonb,uuid,text,text) to service_role;

-- Exact decimal int64 parsing; JSON numeric values are intentionally ineligible.
create function private.creator_event_provider_ns(p_value jsonb)
returns numeric language sql immutable set search_path='' as $$
  select case when jsonb_typeof(p_value)='string' and (p_value#>>'{}')~'^[1-9][0-9]{0,18}$'
    then case when (p_value#>>'{}')::numeric<=9223372036854775807 then (p_value#>>'{}')::numeric end end;
$$;
revoke all on function private.creator_event_provider_ns(jsonb) from public,anon,authenticated,service_role;

create function private.creator_event_verified_coverage(p_event_id uuid,p_original_terms jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.creator_event_provider_coverage_receipts;a private.creator_event_broadcast_attempts;
  promised_start timestamptz;promised_end timestamptz;s numeric;f numeric;ss numeric;sf numeric;d numeric;n numeric;
  full_interval boolean;observed jsonb;
  held jsonb:=jsonb_build_object('evidence_available',false,'full_original_interval',false,'review_required',true,
    'coverage_kind','provider_recorded_output_interval','reason','provider_coverage_unverified');
begin
  -- Called only by the private contract-bound settlement issuer. No API grants.
  -- Serialize issuance with late provider facts using the same event-first lock.
  perform 1 from public.creator_events where id=p_event_id for update;
  if not found then return held; end if;
  if jsonb_typeof(p_original_terms)<>'object' then return held; end if;
  begin
    promised_start:=(p_original_terms->>'startsAt')::timestamptz;
    promised_end:=(p_original_terms->>'endsAt')::timestamptz;
  exception when others then return held; end;
  if promised_start is null or promised_end is null or not isfinite(promised_start) or not isfinite(promised_end)
    or promised_end<=promised_start or promised_end>clock_timestamp() then return held; end if;
  for c in select * from private.creator_event_provider_coverage_receipts
    where event_id=p_event_id and provider_status='COMPLETE' and private_origin_verified and binding_verified
      and event_starts_at=promised_start and event_ends_at=promised_end order by received_at,id
  loop
    select * into a from private.creator_event_broadcast_attempts where id=c.attempt_id;
    if a.creator_event_id is distinct from p_event_id or a.creator_id is distinct from c.creator_id
      or a.creator_session_id is distinct from c.creator_session_id or a.server_id is distinct from c.server_id
      or a.livekit_room_name is distinct from c.room_name or a.output_prefix is distinct from c.output_prefix
      or a.egress_id is distinct from c.egress_id or a.state<>'stopped'
      or c.timing->'interrupted' is distinct from 'false'::jsonb then continue; end if;
    s:=private.creator_event_provider_ns(c.timing->'startedAtNs');
    f:=private.creator_event_provider_ns(c.timing->'endedAtNs');
    ss:=private.creator_event_provider_ns(c.timing->'segmentsStartedAtNs');
    sf:=private.creator_event_provider_ns(c.timing->'segmentsEndedAtNs');
    d:=private.creator_event_provider_ns(c.timing->'durationNs');
    n:=private.creator_event_provider_ns(c.timing->'segmentCount');
    -- No clock-based inference and no rounding outward. Validate actual facts
    -- separately from whether they cover the entire originally promised interval.
    if s is null or f is null or ss is null or sf is null or d is null or n is null
      or s<extract(epoch from a.started_at)*1000000000 or s>ss or ss>=sf or sf>f
      or f>extract(epoch from c.received_at)*1000000000
      or d<sf-ss or d>f-s then continue; end if;
    if not exists(select 1 from private.creator_event_provider_coverage_receipts x
        where x.attempt_id=c.attempt_id and x.egress_id=c.egress_id and x.activation_confirmed
          and x.private_origin_verified and x.binding_verified and x.received_at<=promised_end
          and x.received_at<=c.received_at
          and x.event_starts_at=promised_start and x.event_ends_at=promised_end
          and private.creator_event_provider_ns(x.timing->'startedAtNs')=s
          and x.timing->'interrupted'='false'::jsonb)
      or exists(select 1 from private.creator_event_broadcast_provider_receipts x
        where x.attempt_id=c.attempt_id and (x.provider_status in('FAILED','ABORTED','UNKNOWN') or not x.binding_verified))
      or exists(select 1 from private.creator_event_provider_coverage_receipts x where x.attempt_id=c.attempt_id
        and (x.timing->'interrupted' is distinct from 'false'::jsonb
          or (x.provider_status in('ACTIVE','ENDING','COMPLETE')
            and private.creator_event_provider_ns(x.timing->'startedAtNs') is null)
          or (private.creator_event_provider_ns(x.timing->'startedAtNs') is not null
            and private.creator_event_provider_ns(x.timing->'startedAtNs')<>s)
          or (x.provider_status='COMPLETE' and x.timing is distinct from c.timing)))
    then continue; end if;
    full_interval:=ss<=extract(epoch from promised_start)*1000000000
      and sf>=extract(epoch from promised_end)*1000000000;
    observed:=jsonb_build_object('evidence_available',true,'full_original_interval',full_interval,
      'review_required',not full_interval,'reason',case when full_interval then 'original_interval_recorded' else 'original_interval_unverified' end,
      'provider_started_at_ns',s::text,'provider_ended_at_ns',f::text,
      'output_started_at_ns',ss::text,'output_ended_at_ns',sf::text,'duration_ns',d::text,'segment_count',n::text,
      'provider_ended_at',to_timestamp(floor(f/1000)/1000000),
      'evidence_reference','creator_event_provider_coverage:'||c.id,
      'promise_hash',encode(extensions.digest(p_original_terms::text,'sha256'),'hex'),
      'coverage_kind','provider_recorded_output_interval');
    if full_interval then return observed; end if;
  end loop;
  return coalesce(observed,held);
end; $$;
revoke all on function private.creator_event_verified_coverage(uuid,jsonb) from public,anon,authenticated,service_role;
