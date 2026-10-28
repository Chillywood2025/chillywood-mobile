-- Approved replay deadline remedy. These are local authoritative observations,
-- not a refund execution, external uptime promise, or historical backfill.
create table private.creator_event_replay_policy_observation(
  singleton boolean primary key default true check(singleton),
  started_at timestamptz not null check(isfinite(started_at))
);
insert into private.creator_event_replay_policy_observation values(true,clock_timestamp());
alter table private.creator_event_replay_policy_observation enable row level security;
alter table private.creator_event_replay_policy_observation force row level security;
revoke all on private.creator_event_replay_policy_observation from public,anon,authenticated,service_role;
create trigger creator_event_replay_policy_observation_immutable before update or delete on private.creator_event_replay_policy_observation
for each row execute function private.guard_creator_event_policy_history();

create table private.creator_event_replay_availability_facts(
  id bigint generated always as identity primary key,
  event_id uuid not null references public.creator_events(id) on delete restrict,
  available boolean not null,observed_at timestamptz not null default clock_timestamp() check(isfinite(observed_at)),
  attempt_id uuid,broadcast_id uuid,record_id uuid,replay_id uuid,receipt_id uuid,
  check(not available or (attempt_id is not null and broadcast_id is not null
    and record_id is not null and replay_id is not null and receipt_id is not null))
);
create index creator_event_replay_availability_event_time on private.creator_event_replay_availability_facts(event_id,observed_at,id);
alter table private.creator_event_replay_availability_facts enable row level security;
alter table private.creator_event_replay_availability_facts force row level security;
revoke all on private.creator_event_replay_availability_facts from public,anon,authenticated,service_role;
revoke all on sequence private.creator_event_replay_availability_facts_id_seq from public,anon,authenticated,service_role;
create trigger creator_event_replay_availability_facts_immutable before update or delete on private.creator_event_replay_availability_facts
for each row execute function private.guard_creator_event_policy_history();

create function private.capture_creator_event_replay_availability(p_event_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare prior private.creator_event_replay_availability_facts;current_source record;is_available boolean;
begin
  if not exists(select 1 from public.creator_events where id=p_event_id) then return; end if;
  if not exists(select 1 from public.paid_creator_events where creator_event_id=p_event_id)
    and not exists(select 1 from public.event_ticket_reservations where creator_event_id=p_event_id)
    and not exists(select 1 from public.paid_creator_event_passes where creator_event_id=p_event_id)
    and not exists(select 1 from private.creator_event_replay_availability_facts where event_id=p_event_id)
  then return; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('creator-event-replay-observation:'||p_event_id::text,0));
  select a.id attempt_id,b.id broadcast_id,h.id record_id,r.id replay_id,receipt.id receipt_id into current_source
  from public.creator_events e
  cross join lateral public.creator_event_broadcast_ready_internal(e.id,e.host_user_id,true) ready
  join public.room_broadcast_sessions b on b.id=ready.broadcast_id
  join public.spectator_hls_playback_records h on h.id=ready.record_id
  join public.creator_replay_library_items r on r.id=ready.replay_id
  join private.creator_event_broadcast_attempts a on a.broadcast_session_id=b.id and a.creator_event_id=e.id
    and a.creator_id=e.host_user_id and a.state='stopped' and a.generation=1 and a.event_terms is not null
  join lateral(select * from private.creator_event_broadcast_provider_receipts rr where rr.attempt_id=a.id
    and rr.provider_status='COMPLETE' and rr.private_origin_verified and rr.binding_verified and rr.egress_id=a.egress_id
    order by rr.received_at,rr.id limit 1)receipt on true
  where e.id=p_event_id and e.status in('ended','replay_available') and e.management_status is distinct from 'no_show'
    and b.egress_id=a.egress_id and b.source_room_id=a.party_id
    and b.hls_playback_url=a.private_origin||'/'||a.output_prefix||'/index.m3u8'
    and h.playlist_path=a.output_prefix||'/index.m3u8'
    and b.metadata->>'producer_attempt_id'=a.id::text
    and b.metadata->>'private_origin_verified'='true' and b.metadata->>'provider_binding_verified'='true'
    and b.metadata->>'replay_receipt_verified'='true'
    and r.metadata->>'producer_attempt_id'=a.id::text
    and b.access_type='ticketed' and h.access_type='ticketed' and h.visibility='private'
    and r.visibility='ticketed' and r.money_status='paid'
  limit 1;
  is_available:=current_source.attempt_id is not null;
  select * into prior from private.creator_event_replay_availability_facts where event_id=p_event_id order by id desc limit 1;
  if prior.id is not null and prior.available=is_available and (not is_available or
    row(prior.attempt_id,prior.broadcast_id,prior.record_id,prior.replay_id,prior.receipt_id)
      is not distinct from row(current_source.attempt_id,current_source.broadcast_id,current_source.record_id,current_source.replay_id,current_source.receipt_id))
  then return; end if;
  insert into private.creator_event_replay_availability_facts(event_id,available,attempt_id,broadcast_id,record_id,replay_id,receipt_id)
  values(p_event_id,is_available,current_source.attempt_id,current_source.broadcast_id,current_source.record_id,current_source.replay_id,current_source.receipt_id);
end;
$$;

create function private.record_creator_event_replay_availability()
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
      perform private.capture_creator_event_replay_availability(event_id);seen:=array_append(seen,event_id);
    end if;
  end loop;
  return coalesce(new,old);
end;
$$;
create trigger record_creator_event_replay_availability after insert or update on public.creator_events
for each row execute function private.record_creator_event_replay_availability();
create trigger record_creator_event_replay_availability after insert or update or delete on public.room_broadcast_sessions
for each row execute function private.record_creator_event_replay_availability();
create trigger record_creator_event_replay_availability after insert or update or delete on public.spectator_hls_playback_records
for each row execute function private.record_creator_event_replay_availability();
create trigger record_creator_event_replay_availability after insert or update or delete on public.creator_replay_library_items
for each row execute function private.record_creator_event_replay_availability();
create trigger record_creator_event_replay_availability after insert or update or delete on private.creator_event_broadcast_attempts
for each row execute function private.record_creator_event_replay_availability();
create trigger record_creator_event_replay_availability after insert or update or delete on private.creator_event_broadcast_provider_receipts
for each row execute function private.record_creator_event_replay_availability();

-- Current positive evidence is observed at cutover, never assigned an invented
-- earlier publication time. Missing pre-cutover history remains unknown.
select private.capture_creator_event_replay_availability(id) from public.creator_events;

create function private.creator_event_replay_deadline_missed(p_event_id uuid,p_deadline timestamptz,p_as_of timestamptz)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(isfinite(p_deadline) and isfinite(p_as_of) and p_as_of>=p_deadline
    and not coalesce((select available from private.creator_event_replay_availability_facts
      where event_id=p_event_id and observed_at<=p_deadline order by observed_at desc,id desc limit 1),false),false);
$$;

alter table public.creator_event_purchase_remedies drop constraint creator_event_purchase_remedies_reason_check;
alter table public.creator_event_purchase_remedies add constraint creator_event_purchase_remedies_reason_check
  check(reason in('event_canceled','event_no_show','material_schedule_change','event_replay_unavailable'));
alter table private.creator_event_ticket_notices drop constraint creator_event_ticket_notices_kind_check;
alter table private.creator_event_ticket_notices add constraint creator_event_ticket_notices_kind_check
  check(kind in('schedule_changed','event_canceled','event_no_show','event_replay_unavailable'));

create or replace function private.extend_creator_event_ticket_policy(
  p_event_id uuid,p_purchase_id uuid,p_item jsonb,p_policy jsonb,p_charge_verified boolean)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare p_event alias for $1;p_purchase alias for $2;
  terms jsonb:=p_item->'terms';deadline timestamptz;expiry timestamptz;original_start timestamptz;original_end timestamptz;observed_from timestamptz;
  missed boolean:=false;buyer uuid:=auth.uid();
  intent_id uuid;pass_id uuid;grant_id uuid;created_at timestamptz;reasons jsonb;notice jsonb;
begin
  if p_policy->>'buyerId' is distinct from buyer::text or p_item->>'sourceId' is distinct from p_event::text
    or p_policy->>'purchaseId' is distinct from p_purchase::text then raise exception 'event_ticket_purchase_required'; end if;
  intent_id:=(p_item->>'purchaseIntentId')::uuid;
  if intent_id is null then return p_policy; end if;
  select r.access_grant_id,p.id into grant_id,pass_id from public.event_ticket_reservations r
    left join public.paid_creator_event_passes p on p.access_grant_id=r.access_grant_id and p.buyer_id=buyer and p.creator_event_id=p_event
    where r.purchase_intent_id=intent_id and r.buyer_id=buyer and r.creator_event_id=p_event;
  select min(r.created_at) into created_at from public.creator_event_purchase_remedies r
    where r.event_id=p_event and r.buyer_id=buyer and r.purchase_intent_id=intent_id and r.reason='event_replay_unavailable';
  missed:=created_at is not null;
  if not missed and terms->>'replayPolicy' in('until_expiration','indefinite')
    and jsonb_typeof(terms->'replayAvailableAt')='string' and jsonb_typeof(terms->'startsAt')='string'
    and jsonb_typeof(terms->'endsAt')='string' then
    begin
      deadline:=(terms->>'replayAvailableAt')::timestamptz;original_start:=(terms->>'startsAt')::timestamptz;original_end:=(terms->>'endsAt')::timestamptz;
      expiry:=case when terms->>'replayPolicy'='until_expiration' then (terms->>'replayExpiresAt')::timestamptz else null end;
      select started_at into strict observed_from from private.creator_event_replay_policy_observation where singleton;
      if isfinite(deadline) and isfinite(original_start) and isfinite(original_end)
        and original_end>original_start and deadline>=original_end and deadline>=observed_from
        and clock_timestamp()>=deadline and (terms->>'replayPolicy'='indefinite' or (isfinite(expiry) and expiry>deadline)) then
        perform private.capture_creator_event_replay_availability(p_event);
        missed:=private.creator_event_replay_deadline_missed(p_event,deadline,clock_timestamp());
      end if;
    exception when invalid_datetime_format or datetime_field_overflow then missed:=false;
    end;
  end if;
  if not missed then return p_policy; end if;
  insert into public.creator_event_purchase_remedies(event_id,buyer_id,pass_id,access_grant_id,purchase_intent_id,reason)
    values(p_event,buyer,pass_id,grant_id,intent_id,'event_replay_unavailable') on conflict do nothing;
  select min(r.created_at) into created_at from public.creator_event_purchase_remedies r
    where r.event_id=p_event and r.buyer_id=buyer and r.purchase_intent_id=intent_id and r.reason='event_replay_unavailable';
  insert into private.creator_event_ticket_notices(event_id,buyer_id,revision_id,kind)
    select p_event,buyer,(p_policy->'currentRevision'->>'id')::uuid,'event_replay_unavailable'
    where not exists(select 1 from private.creator_event_ticket_notices n where n.event_id=p_event
      and n.buyer_id=buyer and n.kind='event_replay_unavailable') on conflict do nothing;
  select jsonb_build_object('id',n.id,'createdAt',n.created_at) into notice from private.creator_event_ticket_notices n
    where n.event_id=p_event and n.buyer_id=buyer and n.kind='event_replay_unavailable' order by n.created_at,n.id limit 1;
  if p_charge_verified then
    select jsonb_agg(value order by value) into reasons from(select distinct value from jsonb_array_elements_text(
      coalesce(p_policy->'refundEligibility'->'reasons','[]'::jsonb)||'"event_replay_unavailable"'::jsonb))r;
    p_policy:=jsonb_set(p_policy,'{refundEligibility}',jsonb_build_object('eligibility','eligible','status','provider_review_required',
      'reasons',reasons,'createdAt',coalesce(p_policy->'refundEligibility'->'createdAt',to_jsonb(created_at))));
  end if;
  return p_policy||jsonb_build_object('notice',notice);
end;
$$;
revoke all on function private.capture_creator_event_replay_availability(uuid),private.record_creator_event_replay_availability(),
  private.creator_event_replay_deadline_missed(uuid,timestamptz,timestamptz),
  private.extend_creator_event_ticket_policy(uuid,uuid,jsonb,jsonb,boolean) from public,anon,authenticated,service_role;
