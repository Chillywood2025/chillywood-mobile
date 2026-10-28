-- Owner-approved schedule policy. Source only: no provider refund, new role,
-- delivery worker activation, or change to original purchase/offer terms.
create table private.creator_event_ticket_policy_observation(
  singleton boolean primary key default true check(singleton),started_at timestamptz not null check(isfinite(started_at))
);
insert into private.creator_event_ticket_policy_observation values(true,clock_timestamp());
alter table private.creator_event_ticket_policy_observation enable row level security;
alter table private.creator_event_ticket_policy_observation force row level security;
revoke all on private.creator_event_ticket_policy_observation from public,anon,authenticated,service_role;
create table private.creator_event_schedule_revisions(
  id uuid primary key default gen_random_uuid(),event_id uuid not null references public.creator_events(id) on delete restrict,
  revision integer not null check(revision>0),starts_at timestamptz,ends_at timestamptz,time_zone text not null,
  event_status text not null,management_status text,created_at timestamptz not null default clock_timestamp(),
  unique(event_id,revision)
);
create table private.creator_event_schedule_choices(
  id uuid primary key default gen_random_uuid(),event_id uuid not null references public.creator_events(id) on delete restrict,
  buyer_id uuid not null,purchase_id uuid not null,purchase_intent_id uuid,
  revision_id uuid not null references private.creator_event_schedule_revisions(id) on delete restrict,
  choice text not null check(choice in('keep_ticket','request_refund_review')),
  created_at timestamptz not null default clock_timestamp(),unique(buyer_id,purchase_id,revision_id)
);
create table private.creator_event_ticket_notices(
  id uuid primary key default gen_random_uuid(),event_id uuid not null references public.creator_events(id) on delete restrict,
  buyer_id uuid not null,revision_id uuid not null references private.creator_event_schedule_revisions(id) on delete restrict,
  kind text not null check(kind in('schedule_changed','event_canceled','event_no_show')),
  created_at timestamptz not null default clock_timestamp(),unique(buyer_id,revision_id,kind)
);
alter table private.creator_event_schedule_revisions enable row level security;
alter table private.creator_event_schedule_revisions force row level security;
alter table private.creator_event_schedule_choices enable row level security;
alter table private.creator_event_schedule_choices force row level security;
alter table private.creator_event_ticket_notices enable row level security;
alter table private.creator_event_ticket_notices force row level security;
revoke all on private.creator_event_schedule_revisions,private.creator_event_schedule_choices,
  private.creator_event_ticket_notices from public,anon,authenticated,service_role;
create index creator_event_schedule_choices_purchase on private.creator_event_schedule_choices(buyer_id,purchase_id,created_at);
create index creator_event_ticket_notices_buyer on private.creator_event_ticket_notices(buyer_id,event_id,created_at);
create table private.creator_event_verified_start_facts(
  attempt_id uuid primary key references private.creator_event_broadcast_attempts(id) on delete restrict,
  event_id uuid not null references public.creator_events(id) on delete restrict,
  revision_id uuid not null references private.creator_event_schedule_revisions(id) on delete restrict,
  receipt_id uuid not null references private.creator_event_broadcast_provider_receipts(id) on delete restrict,
  advertised_starts_at timestamptz not null,advertised_time_zone text not null,verified_at timestamptz not null
);
alter table private.creator_event_verified_start_facts enable row level security;
alter table private.creator_event_verified_start_facts force row level security;
revoke all on private.creator_event_verified_start_facts from public,anon,authenticated,service_role;

-- A migration snapshot is the known current advertised schedule, never a
-- fabricated original purchase contract. Original terms remain in reservations.
insert into private.creator_event_schedule_revisions(event_id,revision,starts_at,ends_at,time_zone,event_status,management_status)
select id,1,starts_at,ends_at,time_zone,status,management_status from public.creator_events e
where exists(select 1 from public.paid_creator_events p where p.creator_event_id=e.id)
  or exists(select 1 from public.paid_creator_event_passes p where p.creator_event_id=e.id)
  or exists(select 1 from public.event_ticket_reservations r where r.creator_event_id=e.id);

create function private.guard_creator_event_policy_history()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'event_ticket_policy_history_immutable'; end;
$$;
create trigger creator_event_schedule_revision_immutable before update or delete on private.creator_event_schedule_revisions
for each row execute function private.guard_creator_event_policy_history();
create trigger creator_event_ticket_policy_observation_immutable before update or delete on private.creator_event_ticket_policy_observation
for each row execute function private.guard_creator_event_policy_history();
create trigger creator_event_schedule_choice_immutable before update or delete on private.creator_event_schedule_choices
for each row execute function private.guard_creator_event_policy_history();
create trigger creator_event_verified_start_fact_immutable before update or delete on private.creator_event_verified_start_facts
for each row execute function private.guard_creator_event_policy_history();

create function private.capture_creator_event_verified_start(p_event_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  insert into private.creator_event_verified_start_facts(attempt_id,event_id,revision_id,receipt_id,
    advertised_starts_at,advertised_time_zone,verified_at)
  select a.id,e.id,s.id,r.id,e.starts_at,e.time_zone,greatest(r.received_at,clock_timestamp())
  from public.creator_events e
  join private.creator_event_broadcast_attempts a on a.creator_event_id=e.id and a.state='active'
  join public.room_broadcast_sessions b on b.id=a.broadcast_session_id
  join public.spectator_hls_playback_records h on h.broadcast_session_id=b.id
  join lateral(select * from private.creator_event_schedule_revisions sr where sr.event_id=e.id order by sr.revision desc limit 1)s on true
  join lateral(select * from private.creator_event_broadcast_provider_receipts rr where rr.attempt_id=a.id
    and rr.provider_status='ACTIVE' and rr.binding_verified and rr.private_origin_verified and rr.egress_id=a.egress_id
    order by rr.received_at,rr.id limit 1)r on true
  where e.id=p_event_id and e.status='live_now' and e.management_status is distinct from 'no_show' and clock_timestamp()>=e.starts_at
    and e.starts_at is not null and b.egress_id=a.egress_id
    and b.creator_event_id=e.id::text and b.host_user_id=a.creator_id::text
    and b.metadata->>'producer_attempt_id'=a.id::text and b.metadata->>'private_origin_verified'='true'
    and b.metadata->>'provider_binding_verified'='true' and b.broadcast_status='active_later'
    and b.playback_url_status='event_ticketed_available' and b.access_type='ticketed'
    and b.requires_ticket and not b.requires_premium and not b.is_publicly_watchable and b.is_spectator_playback_enabled
    and h.playback_status='live' and h.access_type='ticketed' and h.requires_ticket and h.is_spectator_playback_enabled
    and h.creator_event_id=e.id::text and h.host_user_id=a.creator_id::text
    and h.playlist_path=a.output_prefix||'/live.m3u8'
    and exists(select 1 from public.creator_event_broadcast_ready_internal(e.id,e.host_user_id,false) ready
      where ready.broadcast_id=b.id and ready.record_id=h.id)
  on conflict(attempt_id) do nothing;
end;
$$;
create function private.record_creator_event_verified_start()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.state='active' then perform private.capture_creator_event_verified_start(new.creator_event_id); end if;
  return new;
end;
$$;
create trigger record_creator_event_verified_start after insert or update on private.creator_event_broadcast_attempts
for each row execute function private.record_creator_event_verified_start();
-- No invented historical opened-at timestamp: existing paid remedies and
-- original contracts are retained. Future verified/opened facts are immutable.
-- An already-open source can be observed at cutover only if its exact current
-- playable authority still passes. This records NOW, never an earlier start.
select private.capture_creator_event_verified_start(id) from public.creator_events where status='live_now';

create function private.record_creator_event_schedule_revision()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_revision uuid;v_number integer;v_kind text;
begin
  if not exists(select 1 from private.creator_event_schedule_revisions where event_id=new.id)
    and not exists(select 1 from public.paid_creator_events where creator_event_id=new.id)
    and not exists(select 1 from public.event_ticket_reservations where creator_event_id=new.id)
    and not exists(select 1 from public.paid_creator_event_passes where creator_event_id=new.id) then return new; end if;
  if tg_op='UPDATE' and row(new.starts_at,new.ends_at,new.time_zone,new.status,new.management_status)
    is not distinct from row(old.starts_at,old.ends_at,old.time_zone,old.status,old.management_status) then return new; end if;
  select coalesce(max(revision),0)+1 into v_number from private.creator_event_schedule_revisions where event_id=new.id;
  insert into private.creator_event_schedule_revisions(event_id,revision,starts_at,ends_at,time_zone,event_status,management_status)
  values(new.id,v_number,new.starts_at,new.ends_at,new.time_zone,new.status,new.management_status) returning id into v_revision;
  if tg_op='UPDATE' and (row(new.starts_at,new.ends_at,new.time_zone) is distinct from row(old.starts_at,old.ends_at,old.time_zone)
    or new.status='canceled') then
    v_kind:=case when new.management_status='no_show' then 'event_no_show'
      when new.status='canceled' then 'event_canceled' else 'schedule_changed' end;
    -- Transactional in-app notices include pending reservations and do not
    -- depend on a voluntary reminder subscription or successful push delivery.
    insert into private.creator_event_ticket_notices(event_id,buyer_id,revision_id,kind)
    select new.id,buyer_id,v_revision,v_kind from (
      select buyer_id from public.event_ticket_reservations where creator_event_id=new.id
      union select buyer_id from public.paid_creator_event_passes where creator_event_id=new.id
    ) buyers on conflict do nothing;
  end if;
  if new.status='live_now' then perform private.capture_creator_event_verified_start(new.id); end if;
  return new;
end;
$$;
create trigger record_creator_event_schedule_revision after insert or update on public.creator_events
for each row execute function private.record_creator_event_schedule_revision();

create function private.seed_creator_event_ticket_schedule()
returns trigger language plpgsql security definer set search_path='' as $$
declare e public.creator_events;
begin
  select * into e from public.creator_events where id=new.creator_event_id for update;
  if not exists(select 1 from private.creator_event_schedule_revisions where event_id=e.id) then
    insert into private.creator_event_schedule_revisions(event_id,revision,starts_at,ends_at,time_zone,event_status,management_status)
    values(e.id,1,e.starts_at,e.ends_at,e.time_zone,e.status,e.management_status);
  end if;
  return new;
end;
$$;
create trigger seed_creator_event_ticket_schedule after insert on public.creator_event_offer_revisions
for each row execute function private.seed_creator_event_ticket_schedule();

create function private.creator_event_schedule_is_material(p_old_start timestamptz,p_old_zone text,p_new_start timestamptz,p_new_zone text)
returns boolean language sql stable set search_path='' as $$
  select p_old_start is not null and p_new_start is not null and (
    p_new_start<p_old_start or p_new_start-p_old_start>=interval '30 minutes'
    or (p_new_start at time zone p_new_zone)::date is distinct from (p_old_start at time zone p_old_zone)::date);
$$;

create function private.creator_event_no_show_due(p_start timestamptz,p_verified_start timestamptz,p_as_of timestamptz)
returns boolean language sql immutable set search_path='' as $$
  select coalesce(p_as_of>=p_start+interval '30 minutes'
    and (p_verified_start is null or p_verified_start>p_start+interval '30 minutes'),false);
$$;

create function private.creator_event_original_ticket_schedule(p_item jsonb)
returns jsonb language plpgsql stable set search_path='' as $$
declare starts timestamptz;ends timestamptz;zone_name text:=p_item->'terms'->>'timeZone';
begin
  if p_item->'terms'->>'startsAt' is null or zone_name is null
    or not exists(select 1 from pg_catalog.pg_timezone_names where name=zone_name)
    or zone_name like 'posix/%' or zone_name like 'right/%' then return null; end if;
  starts:=(p_item->'terms'->>'startsAt')::timestamptz;ends:=(p_item->'terms'->>'endsAt')::timestamptz;
  if not isfinite(starts) or (ends is not null and (not isfinite(ends) or ends<=starts)) then return null; end if;
  return jsonb_build_object('startsAt',starts,'endsAt',ends,'timeZone',zone_name);
exception when invalid_datetime_format or datetime_field_overflow then return null;
end;
$$;

-- Only a bound provider ACTIVE receipt which actually reached the verified
-- private playable projection proves delivery. A creator status/attempt-start
-- toggle, pending Egress, or a late ACTIVE receipt does not prove on-time start.
create function private.creator_event_verified_start_at(p_event_id uuid,p_advertised_start timestamptz)
returns timestamptz language sql stable security definer set search_path='' as $$
  select min(verified_at) from private.creator_event_verified_start_facts where event_id=p_event_id
    and verified_at>=p_advertised_start;
$$;

-- Resolve the exact wallet identity using the existing authoritative history
-- reader. It also handles legacy ledger IDs and pending/unfulfilled payments;
-- a client never supplies a grant, provider receipt or guessed original terms.
create function private.creator_event_ticket_policy_item(p_event_id uuid,p_purchase_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare page jsonb;item jsonb;before_at timestamptz;before_id uuid;
begin
  loop
    page:=public.read_my_creator_purchases_pre_event_remedies(100,before_at,before_id,'event',p_event_id);
    select value into item from jsonb_array_elements(page->'items') where value->>'id'=p_purchase_id::text;
    if item is not null then return item; end if;
    if page->'nextCursor' is null or page->'nextCursor'='null'::jsonb then return null; end if;
    before_at:=(page->'nextCursor'->>'createdAt')::timestamptz;before_id:=(page->'nextCursor'->>'id')::uuid;
  end loop;
end;
$$;

-- Forward policy extensions receive the already authenticated immutable wallet
-- identity and exact verified-charge result; they cannot bypass admission.
create function private.extend_creator_event_ticket_policy(
  p_event_id uuid,p_purchase_id uuid,p_item jsonb,p_policy jsonb,p_charge_verified boolean)
returns jsonb language sql volatile security definer set search_path='' as $$ select p_policy; $$;

create function private.creator_event_ticket_policy(p_event_id uuid,p_purchase_id uuid,p_known_item jsonb default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare e public.creator_events;item jsonb;current_revision private.creator_event_schedule_revisions;
  accepted private.creator_event_schedule_choices;baseline private.creator_event_schedule_revisions;
  original jsonb;start_at timestamptz;zone_name text;begin_at timestamptz;end_at timestamptz;deadline timestamptz;
  delivered_at timestamptz;material boolean:=false;missed boolean:=false;paid boolean:=false;terminal boolean;
  reasons text[]:='{}';history jsonb;notice jsonb;eligibility jsonb;decision record;prior record;result jsonb;
  intent_id uuid;v_pass_id uuid;v_grant_id uuid;choice_now text;buyer uuid:=auth.uid();created_at timestamptz:=clock_timestamp();observed_from timestamptz;
begin
  if buyer is null or not public.whole_app_exact_current_session_authority_internal()
    or not public.wave1_current_caller_authority_internal() or public.is_account_access_restricted(buyer::text)
  then raise exception 'event_ticket_buyer_session_required'; end if;
  select * into e from public.creator_events where id=p_event_id for update;
  if e.id is null then raise exception 'event_ticket_purchase_required'; end if;
  item:=coalesce(p_known_item,private.creator_event_ticket_policy_item(e.id,p_purchase_id));
  if item is null or item->>'sourceId' is distinct from e.id::text then raise exception 'event_ticket_purchase_required'; end if;
  intent_id:=(item->>'purchaseIntentId')::uuid;
  -- Bind the exact wallet purchase to its exact grant/pass. In particular a
  -- legacy receipt must never inherit another ticket from the same event.
  select p.id,p.access_grant_id into v_pass_id,v_grant_id
  from public.paid_creator_event_passes p
  join public.access_grants g on g.id=p.access_grant_id and g.user_id=buyer
    and g.source_type='provider_event' and g.source_id=e.id and g.grant_type='event_pass'
  left join public.event_ticket_reservations r on r.access_grant_id=p.access_grant_id and r.buyer_id=buyer
  where p.creator_event_id=e.id and p.buyer_id=buyer
    and ((intent_id is not null and r.purchase_intent_id=intent_id)
      or (intent_id is null and g.provider_event_id::text=item->'receipt'->>'providerEventId'
        and exists(select 1 from public.money_access_ledger_events l where l.id=p_purchase_id
          and l.user_id=buyer and l.source_type='event' and l.source_id=e.id and l.provider_event_id=g.provider_event_id)))
  order by p.created_at desc limit 1;
  -- Same verified charge/reconciliation binding as the previous outer wallet.
  if item->'receipt'->>'providerEventId' is not null and item->>'status' in
    ('active','upcoming','expired','completed','canceled','paid_unfulfilled','reconciliation_required') then
    select exists(select 1 from public.provider_events paid_event
      left join public.money_purchase_intents i on i.id=intent_id and i.user_id=buyer and i.source_type='event' and i.source_id=e.id
      where paid_event.id::text=item->'receipt'->>'providerEventId' and paid_event.user_id=buyer
        and paid_event.event_type in('INITIAL_PURCHASE','NON_RENEWING_PURCHASE','RENEWAL')
        and ((i.id is not null and paid_event.product_id=i.product_id and paid_event.provider=i.provider
          and paid_event.environment=i.environment and paid_event.metadata->>'purchase_intent_id'=i.id::text
          and paid_event.metadata->>'provider_product_id'=i.provider_product_id
          and (paid_event.status='processed' or (paid_event.status='ignored' and exists(
            select 1 from public.revenuecat_provider_reconciliation_obligations o where o.provider_event_id=paid_event.id
              and o.user_id=buyer and o.purchase_intent_id=i.id and o.provider=i.provider and o.environment=i.environment
              and o.provider_product_id=i.provider_product_id and o.state='pending_reconciliation'))))
          or (intent_id is null and v_grant_id is not null and exists(select 1 from public.access_grants g
            where g.id=v_grant_id and g.provider_event_id=paid_event.id)))) into paid;
  end if;
  select * into current_revision from private.creator_event_schedule_revisions where event_id=e.id order by revision desc limit 1;
  select * into accepted from private.creator_event_schedule_choices where event_id=e.id and buyer_id=buyer
    and purchase_id=p_purchase_id and choice='keep_ticket' order by created_at desc,id desc limit 1;
  select * into baseline from private.creator_event_schedule_revisions where id=accepted.revision_id;
  original:=private.creator_event_original_ticket_schedule(item);
  select started_at into strict observed_from from private.creator_event_ticket_policy_observation where singleton;
  start_at:=(original->>'startsAt')::timestamptz;
  zone_name:=coalesce(original->>'timeZone',(select time_zone from private.creator_event_schedule_revisions where event_id=e.id order by revision limit 1));
  begin_at:=(item->>'createdAt')::timestamptz;
  -- Each explicit acceptance closes one protection interval and opens another.
  -- A deadline already missed is retained even after later acceptance/delivery.
  for decision in select c.created_at,r.starts_at,r.time_zone from private.creator_event_schedule_choices c
    join private.creator_event_schedule_revisions r on r.id=c.revision_id
    where c.event_id=e.id and c.buyer_id=buyer and c.purchase_id=p_purchase_id and c.choice='keep_ticket'
    order by c.created_at,c.id
  loop
    delivered_at:=private.creator_event_verified_start_at(e.id,start_at);
    deadline:=start_at+interval '30 minutes';
    if start_at>=observed_from and private.creator_event_no_show_due(start_at,delivered_at,decision.created_at) then missed:=true; end if;
    start_at:=decision.starts_at;zone_name:=decision.time_zone;begin_at:=decision.created_at;
  end loop;
  delivered_at:=private.creator_event_verified_start_at(e.id,start_at);
  deadline:=start_at+interval '30 minutes';
  if start_at>=observed_from and private.creator_event_no_show_due(start_at,delivered_at,created_at) then missed:=true; end if;
  for prior in select r.*,lag(r.starts_at) over(order by r.revision) previous_start,
      lag(r.time_zone) over(order by r.revision) previous_zone from private.creator_event_schedule_revisions r where event_id=e.id
  loop
    if prior.revision>coalesce(baseline.revision,0) and prior.created_at>=begin_at and (
      private.creator_event_schedule_is_material(start_at,zone_name,prior.starts_at,prior.time_zone)
      or private.creator_event_schedule_is_material(prior.previous_start,prior.previous_zone,prior.starts_at,prior.time_zone))
    then material:=true; end if;
  end loop;
  if private.creator_event_schedule_is_material(start_at,zone_name,e.starts_at,e.time_zone) then material:=true; end if;
  select choice into choice_now from private.creator_event_schedule_choices where event_id=e.id and buyer_id=buyer
    and purchase_id=p_purchase_id and revision_id=current_revision.id;
  if exists(select 1 from public.creator_event_purchase_remedies r where r.event_id=e.id and r.buyer_id=buyer
    and r.reason='material_schedule_change' and (r.purchase_intent_id=intent_id or (intent_id is null and r.pass_id=v_pass_id)))
    and accepted.id is null then material:=true; end if;
  if e.status='canceled' and e.management_status is distinct from 'no_show' then reasons:=array_append(reasons,'event_canceled'); end if;
  if missed or e.management_status='no_show' or exists(select 1 from public.creator_event_purchase_remedies r
    where r.event_id=e.id and r.buyer_id=buyer and r.reason='event_no_show'
      and (r.purchase_intent_id=intent_id or (intent_id is null and r.pass_id=v_pass_id)))
  then reasons:=array_append(reasons,'event_no_show'); end if;
  if material or exists(select 1 from private.creator_event_schedule_choices c where c.buyer_id=buyer
    and c.event_id=e.id and c.purchase_id=p_purchase_id and c.choice='request_refund_review')
  then reasons:=array_append(reasons,'material_schedule_change'); end if;
  if 'event_no_show'=any(reasons) and (intent_id is not null or v_pass_id is not null) then
    insert into public.creator_event_purchase_remedies(event_id,buyer_id,pass_id,access_grant_id,purchase_intent_id,reason)
      values(e.id,buyer,v_pass_id,v_grant_id,intent_id,'event_no_show') on conflict do nothing;
    insert into private.creator_event_ticket_notices(event_id,buyer_id,revision_id,kind)
      values(e.id,buyer,current_revision.id,'event_no_show') on conflict do nothing;
  end if;
  if paid and cardinality(reasons)>0 then eligibility:=jsonb_build_object('eligibility','eligible',
    'status','provider_review_required','reasons',to_jsonb(reasons),'createdAt',created_at); end if;
  select coalesce(jsonb_agg(jsonb_build_object('revisionId',c.revision_id,'choice',c.choice,'createdAt',c.created_at,
    'schedule',jsonb_build_object('startsAt',r.starts_at,'endsAt',r.ends_at,'timeZone',r.time_zone))
    order by c.created_at,c.id),'[]'::jsonb) into history from private.creator_event_schedule_choices c
    join private.creator_event_schedule_revisions r on r.id=c.revision_id
    where c.buyer_id=buyer and c.event_id=e.id and c.purchase_id=p_purchase_id;
  select jsonb_build_object('id',n.id,'createdAt',n.created_at) into notice from private.creator_event_ticket_notices n
    where n.event_id=e.id and n.buyer_id=buyer order by n.created_at desc,n.id desc limit 1;
  terminal:=e.status in('canceled','expired') or 'event_no_show'=any(reasons)
    or item->>'status' in('refunded','revoked','disputed','failed');
  result:=jsonb_build_object('eventId',e.id,'purchaseId',p_purchase_id,'purchaseIntentId',intent_id,'buyerId',buyer,
    'currentRevision',jsonb_build_object('id',current_revision.id,'startsAt',current_revision.starts_at,
      'endsAt',current_revision.ends_at,'timeZone',current_revision.time_zone),
    'originalSchedule',original,'acceptedRevisionId',accepted.revision_id,
    'choiceRequired',material and choice_now is null and not terminal,
    'refundEligibility',eligibility,'history',history,'notice',notice);
  return private.extend_creator_event_ticket_policy(e.id,p_purchase_id,item,result,paid);
end;
$$;

create function public.read_my_creator_event_ticket_policy(p_creator_event_id uuid,p_purchase_id uuid)
returns jsonb language sql volatile security definer set search_path='' as $$
  select private.creator_event_ticket_policy(p_creator_event_id,p_purchase_id);
$$;
create function public.respond_creator_event_schedule_change(
  p_creator_event_id uuid,p_purchase_id uuid,p_expected_revision_id uuid,p_choice text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare policy jsonb;existing private.creator_event_schedule_choices;
begin
  if p_choice is null or p_choice not in('keep_ticket','request_refund_review') then raise exception 'event_ticket_choice_invalid'; end if;
  policy:=private.creator_event_ticket_policy(p_creator_event_id,p_purchase_id);
  if p_expected_revision_id is null or policy->'currentRevision'->>'id' is distinct from p_expected_revision_id::text
  then raise exception 'event_ticket_revision_changed'; end if;
  select * into existing from private.creator_event_schedule_choices where event_id=p_creator_event_id
    and buyer_id=auth.uid() and purchase_id=p_purchase_id and revision_id=p_expected_revision_id;
  if existing.id is not null then
    if existing.choice<>p_choice then raise exception 'event_ticket_choice_already_recorded'; end if;
    return policy;
  end if;
  if (policy->>'choiceRequired')::boolean is distinct from true then raise exception 'event_ticket_choice_unavailable'; end if;
  insert into private.creator_event_schedule_choices(event_id,buyer_id,purchase_id,purchase_intent_id,revision_id,choice)
  values(p_creator_event_id,auth.uid(),p_purchase_id,(policy->>'purchaseIntentId')::uuid,p_expected_revision_id,p_choice);
  return private.creator_event_ticket_policy(p_creator_event_id,p_purchase_id);
end;
$$;

revoke all on function private.guard_creator_event_policy_history(),private.record_creator_event_schedule_revision(),private.record_creator_event_verified_start(),
  private.capture_creator_event_verified_start(uuid),private.seed_creator_event_ticket_schedule(),
  private.creator_event_schedule_is_material(timestamptz,text,timestamptz,text),private.creator_event_verified_start_at(uuid,timestamptz),
  private.creator_event_no_show_due(timestamptz,timestamptz,timestamptz),
  private.creator_event_original_ticket_schedule(jsonb),
  private.extend_creator_event_ticket_policy(uuid,uuid,jsonb,jsonb,boolean),
  private.creator_event_ticket_policy_item(uuid,uuid),private.creator_event_ticket_policy(uuid,uuid,jsonb)
  from public,anon,authenticated,service_role;
revoke all on function public.read_my_creator_event_ticket_policy(uuid,uuid),
  public.respond_creator_event_schedule_change(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.read_my_creator_event_ticket_policy(uuid,uuid),
  public.respond_creator_event_schedule_change(uuid,uuid,uuid,text) to authenticated;

create or replace function public.manage_creator_event_lifecycle(
  p_creator_event_id uuid,p_action text,p_expected_updated_at timestamptz,
  p_starts_at timestamptz default null,p_ends_at timestamptz default null,
  p_time_zone text default null,p_message text default null,p_material_change boolean default false
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.creator_events; v_actor uuid:=auth.uid(); v_status text; v_management text;
  v_message text:=nullif(btrim(p_message),''); v_purchased boolean; v_reason text;
  v_starts timestamptz; v_ends timestamptz; v_zone text;
begin
  if v_actor is null or not public.wave1_current_caller_authority_internal()
    or public.is_account_access_restricted(v_actor::text) then raise exception 'event_creator_session_required'; end if;
  select * into e from public.creator_events where id=p_creator_event_id for update;
  if e.id is null or e.host_user_id is distinct from v_actor then raise exception 'event_creator_required'; end if;
  if p_expected_updated_at is null or e.updated_at is distinct from p_expected_updated_at then raise exception 'event_changed_refresh_required'; end if;
  if p_action is null or p_action not in ('publish','start','delay','reschedule','end','cancel','mark_no_show','stop_sales') then raise exception 'event_action_invalid'; end if;
  if not coalesce(isfinite(p_starts_at),true) or not coalesce(isfinite(p_ends_at),true) then raise exception 'event_finite_schedule_required'; end if;
  if char_length(v_message)>1000 then raise exception 'event_message_too_long'; end if;
  if p_action in ('delay','reschedule','cancel','mark_no_show') and v_message is null then raise exception 'event_update_message_required'; end if;
  select exists(select 1 from public.paid_creator_event_passes p where p.creator_event_id=e.id
    and p.refunded_at is null and p.revoked_at is null and p.status in ('active','expired'))
    or exists(select 1 from public.event_ticket_reservations r where r.creator_event_id=e.id) into v_purchased;
  v_status:=e.status; v_management:=e.management_status; v_starts:=e.starts_at; v_ends:=e.ends_at; v_zone:=e.time_zone;
  if p_action='publish' then
    if e.status<>'draft' or e.starts_at is null or e.starts_at<=clock_timestamp() then raise exception 'event_future_draft_required'; end if;
    v_status:='scheduled';v_management:='published';
  elsif p_action='start' then
    if e.status<>'scheduled' then raise exception 'event_scheduled_required'; end if;
    if clock_timestamp()<e.starts_at and (v_purchased or exists(select 1 from public.paid_creator_events
      where creator_event_id=e.id and status in('active','sandbox','sold_out','paused')))
    then raise exception 'event_advertised_start_not_reached'; end if;
    if not exists(select 1 from public.creator_event_broadcast_ready_internal(e.id,e.host_user_id,false)) then raise exception 'event_verified_broadcast_required'; end if;
    v_status:='live_now';v_management:='live';
  elsif p_action in ('delay','reschedule') then
    if e.status<>'scheduled' then raise exception 'event_scheduled_required'; end if;
    if p_action='reschedule' and p_starts_at is null then raise exception 'event_new_start_required'; end if;
    if p_ends_at is not null and p_starts_at is null then raise exception 'event_new_start_required'; end if;
    if p_starts_at is not null then
      if p_starts_at<=clock_timestamp() then raise exception 'event_new_start_must_be_future'; end if;
      v_starts:=p_starts_at;
      -- Preserve the declared duration when the creator supplies only a new start.
      v_ends:=coalesce(p_ends_at,case when e.ends_at is not null and e.starts_at is not null then p_starts_at+(e.ends_at-e.starts_at) else null end);
      if v_ends is not null and v_ends<=v_starts then raise exception 'event_end_after_start_required'; end if;
      -- Server policy computes materiality per original/accepted buyer revision.
      -- This schedule-only operation cannot reduce or alter purchased duration.
      if v_purchased and (v_ends-v_starts) is distinct from (e.ends_at-e.starts_at)
      then raise exception 'purchased_event_duration_immutable'; end if;
    end if;
    v_zone:=coalesce(nullif(btrim(p_time_zone),''),e.time_zone);
    if not exists(select 1 from pg_catalog.pg_timezone_names where name=v_zone) then raise exception 'event_time_zone_invalid'; end if;
    v_management:=case when p_action='delay' then 'delayed' else 'rescheduled' end;
  elsif p_action='end' then
    if e.status<>'live_now' then raise exception 'event_live_required'; end if;
    v_status:='ended';v_management:='ended';
  elsif p_action='cancel' then
    if e.status in ('ended','expired','canceled') then raise exception 'event_already_terminal'; end if;
    v_status:='canceled';v_management:='canceled';v_reason:='event_canceled';
  elsif p_action='mark_no_show' then
    if e.status<>'scheduled' or e.starts_at is null or e.starts_at+interval '30 minutes'>clock_timestamp() then raise exception 'event_no_show_grace_not_elapsed'; end if;
    if private.creator_event_verified_start_at(e.id,e.starts_at)<=e.starts_at+interval '30 minutes' then raise exception 'event_verified_started_not_no_show'; end if;
    v_status:='canceled';v_management:='no_show';v_reason:='event_no_show';
  elsif p_action='stop_sales' then v_management:='sales_paused';
  end if;
  insert into private.creator_event_lifecycle_permits values(txid_current(),e.id,v_actor);
  update public.creator_events set status=v_status,management_status=v_management,status_message=v_message,
    starts_at=v_starts,ends_at=v_ends,time_zone=v_zone,reminder_ready=case when v_status='scheduled' then reminder_ready else false end,
    updated_at=clock_timestamp() where id=e.id returning * into e;
  delete from private.creator_event_lifecycle_permits where transaction_id=txid_current() and event_id=e.id;
  if p_action in ('delay','reschedule','end','cancel','mark_no_show','stop_sales') then
    update public.paid_creator_events set sales_paused=true,updated_at=clock_timestamp()
      where creator_event_id=e.id and status in ('active','sandbox','sold_out','paused');
  end if;
  if v_reason is not null then
    insert into public.creator_event_purchase_remedies(event_id,buyer_id,pass_id,access_grant_id,purchase_intent_id,reason)
    select e.id,p.buyer_id,p.id,p.access_grant_id,r.purchase_intent_id,v_reason
      from public.paid_creator_event_passes p
      left join public.event_ticket_reservations r on r.access_grant_id=p.access_grant_id and r.buyer_id=p.buyer_id
      where p.creator_event_id=e.id and p.refunded_at is null and p.revoked_at is null and p.status in ('active','expired')
    on conflict do nothing;
    -- Reservations can later receive an already-charged provider event without
    -- ever producing a pass. Preserve the exact intent's conditional remedy;
    -- the buyer wallet exposes it only after verified payment evidence exists.
    insert into public.creator_event_purchase_remedies(event_id,buyer_id,access_grant_id,purchase_intent_id,reason)
    select e.id,r.buyer_id,r.access_grant_id,r.purchase_intent_id,v_reason
      from public.event_ticket_reservations r where r.creator_event_id=e.id
    on conflict do nothing;
  end if;
  return to_jsonb(e);
end;
$$;
revoke all on function public.manage_creator_event_lifecycle(uuid,text,timestamptz,timestamptz,timestamptz,text,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.manage_creator_event_lifecycle(uuid,text,timestamptz,timestamptz,timestamptz,text,text,boolean) to authenticated;

-- Preserve the existing inner purchase/refund projection and its immutable
-- identity rules. The outer wallet now evaluates due protection on read; it is
-- deliberately VOLATILE because earned no-show notices/remedies are durable.
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
revoke all on function public.read_my_creator_purchases(integer,timestamptz,uuid,text,uuid) from public,anon,service_role;
grant execute on function public.read_my_creator_purchases(integer,timestamptz,uuid,text,uuid) to authenticated;
