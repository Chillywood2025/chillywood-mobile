-- Source-only scheduled virtual ticket terms and inventory. No provider/catalog,
-- rollout, price, revenue split, refund or payout setting is changed here.
alter table public.creator_events add column time_zone text not null default 'UTC';
create function private.validate_creator_event_time_zone()
returns trigger language plpgsql set search_path='' as $$
begin
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.time_zone)
    or new.time_zone like 'posix/%' or new.time_zone like 'right/%'
  then raise exception 'event_time_zone_invalid'; end if;
  return new;
end;
$$;
create trigger validate_creator_event_time_zone before insert or update of time_zone
on public.creator_events for each row execute function private.validate_creator_event_time_zone();
revoke all on function private.validate_creator_event_time_zone() from public,anon,authenticated,service_role;

create table public.creator_event_offer_revisions(
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.paid_creator_events(id) on delete restrict,
  creator_event_id uuid not null references public.creator_events(id) on delete restrict,
  creator_id uuid not null,
  revision integer not null check(revision>0),
  terms jsonb not null check(jsonb_typeof(terms)='object'),
  created_at timestamptz not null default clock_timestamp(),
  unique(offer_id,revision)
);
alter table public.paid_creator_events add column current_terms_revision_id uuid
  references public.creator_event_offer_revisions(id) on delete restrict;
alter table public.paid_creator_events add column sales_paused boolean not null default false;
alter table public.money_purchase_intents add column event_terms_revision_id uuid
  references public.creator_event_offer_revisions(id) on delete restrict;

create table public.event_ticket_reservations(
  id uuid primary key default gen_random_uuid(),
  purchase_intent_id uuid not null unique references public.money_purchase_intents(id) on delete restrict,
  revision_id uuid not null references public.creator_event_offer_revisions(id) on delete restrict,
  buyer_id uuid not null,
  creator_event_id uuid not null references public.creator_events(id) on delete restrict,
  offer_id uuid not null references public.paid_creator_events(id) on delete restrict,
  state text not null default 'held' check(state in('held','fulfilling','fulfilled','expired','canceled','reconciliation_required')),
  expires_at timestamptz not null,
  fulfilling_provider_event_id text,
  access_grant_id uuid references public.access_grants(id) on delete restrict,
  reason text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index event_ticket_reservations_inventory on public.event_ticket_reservations(creator_event_id,state,expires_at);
create index event_ticket_reservations_buyer on public.event_ticket_reservations(buyer_id,created_at desc);
create index creator_event_offer_revisions_event on public.creator_event_offer_revisions(creator_event_id,created_at desc);
alter table public.creator_event_offer_revisions enable row level security;
alter table public.creator_event_offer_revisions force row level security;
alter table public.event_ticket_reservations enable row level security;
alter table public.event_ticket_reservations force row level security;
revoke all on public.creator_event_offer_revisions,public.event_ticket_reservations from public,anon,authenticated,service_role;
grant select on public.creator_event_offer_revisions,public.event_ticket_reservations to authenticated;
create function public.event_ticket_self_read_authorized()
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and public.wave1_current_caller_authority_internal()
    and not public.is_account_access_restricted(auth.uid()::text);
$$;
revoke all on function public.event_ticket_self_read_authorized() from public,anon,authenticated,service_role;
grant execute on function public.event_ticket_self_read_authorized() to authenticated;
create policy event_ticket_reservations_own_read on public.event_ticket_reservations for select to authenticated
using(buyer_id=(select auth.uid()) and public.event_ticket_self_read_authorized());
create policy creator_event_offer_revisions_read on public.creator_event_offer_revisions for select to authenticated
using(public.event_ticket_self_read_authorized() and (
  creator_id=(select auth.uid()) or exists(select 1 from public.event_ticket_reservations r
    where r.revision_id=creator_event_offer_revisions.id and r.buyer_id=(select auth.uid()))
));

create function private.guard_event_ticket_terms_immutable()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'event_ticket_terms_immutable'; end;
$$;
create trigger event_ticket_terms_immutable before update or delete on public.creator_event_offer_revisions
for each row execute function private.guard_event_ticket_terms_immutable();
revoke all on function private.guard_event_ticket_terms_immutable() from public,anon,authenticated,service_role;

create function public.event_ticket_inventory_internal(p_creator_event_id uuid)
returns integer language sql volatile security definer set search_path='' as $$
  select (
    (select count(*) from public.paid_creator_event_passes p where p.creator_event_id=p_creator_event_id
      and p.status='active' and p.refunded_at is null and p.revoked_at is null
      and (p.expires_at is null or p.expires_at>clock_timestamp()))
    +(select count(*) from public.event_ticket_reservations r where r.creator_event_id=p_creator_event_id
      and (r.state='fulfilling' or (r.state='held' and r.expires_at>clock_timestamp())))
  )::integer;
$$;
revoke all on function public.event_ticket_inventory_internal(uuid) from public,anon,authenticated,service_role;

-- Enforce the capacity floor on the table as well as the new editor RPC so a
-- still-supported legacy setter cannot discard another buyer's valid hold.
create function private.guard_event_ticket_capacity_floor()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.creator_events where id=new.creator_event_id for update;
  if new.capacity_limit is not null and new.capacity_limit<public.event_ticket_inventory_internal(new.creator_event_id)
  then raise exception 'event_capacity_below_committed'; end if;
  return new;
end;
$$;
create trigger guard_event_ticket_capacity_floor before insert or update of capacity_limit on public.paid_creator_events
for each row execute function private.guard_event_ticket_capacity_floor();
revoke all on function private.guard_event_ticket_capacity_floor() from public,anon,authenticated,service_role;

create function private.guard_event_offer_current_actor()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if auth.role()='authenticated' and (auth.uid() is null
    or not public.wave1_current_caller_authority_internal()
    or public.is_account_access_restricted(auth.uid()::text))
  then raise exception 'creator_session_authority_required'; end if;
  return new;
end;
$$;
create trigger guard_event_offer_current_actor before insert or update on public.paid_creator_events
for each row execute function private.guard_event_offer_current_actor();
revoke all on function private.guard_event_offer_current_actor() from public,anon,authenticated,service_role;

create function public.event_ticket_reservation_safe_row(r public.event_ticket_reservations)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',r.id,'purchaseIntentId',r.purchase_intent_id,
    'buyerId',r.buyer_id,'offerId',r.offer_id,'creatorEventId',r.creator_event_id,
    'termsRevisionId',r.revision_id,'expiresAt',r.expires_at,
    'state',case when r.state='held' and r.expires_at<=clock_timestamp() then 'expired' else r.state end,
    'priceCents',(v.terms->>'priceCents')::integer,'currency',v.terms->>'currency',
    'reason',r.reason,'terms',v.terms||jsonb_build_object('id',v.id,'offerId',v.offer_id,
      'creatorEventId',v.creator_event_id,'revision',v.revision))
  from public.creator_event_offer_revisions v where v.id=r.revision_id;
$$;
revoke all on function public.event_ticket_reservation_safe_row(public.event_ticket_reservations) from public,anon,authenticated,service_role;

alter function public.paid_creator_event_safe_row(public.paid_creator_events)
rename to paid_creator_event_safe_row_pre_reserved_terms;
revoke all on function public.paid_creator_event_safe_row_pre_reserved_terms(public.paid_creator_events) from public,anon,authenticated,service_role;
create function public.paid_creator_event_safe_row(event_row public.paid_creator_events)
returns jsonb language sql stable security definer set search_path='' as $$
  select public.paid_creator_event_safe_row_pre_reserved_terms(event_row)
    ||jsonb_build_object('termsRevisionId',v.id,'timeZone',v.terms->>'timeZone','salesPaused',event_row.sales_paused,
      'salesOpenAt',v.terms->>'salesOpenAt','salesCloseAt',v.terms->>'salesCloseAt',
      'terms',case when v.id is null then null else v.terms||jsonb_build_object(
        'id',v.id,'offerId',v.offer_id,'creatorEventId',v.creator_event_id,'revision',v.revision) end)
  from (select 1) singleton left join public.creator_event_offer_revisions v
    on v.id=event_row.current_terms_revision_id;
$$;
revoke all on function public.paid_creator_event_safe_row(public.paid_creator_events) from public,anon,authenticated,service_role;

create function public.configure_paid_creator_event_sale(
  p_creator_event_id uuid,p_description text,p_price_cents integer,p_capacity_limit integer,
  p_status text,p_time_zone text,p_sales_open_at timestamptz,p_sales_close_at timestamptz,
  p_expected_updated_at timestamptz default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.creator_events; o public.paid_creator_events; v_id uuid; v_revision integer; v_status text;
begin
  if auth.uid() is null or not public.wave1_current_caller_authority_internal()
    or public.is_account_access_restricted(auth.uid()::text)
  then raise exception 'creator_session_authority_required'; end if;
  select * into e from public.creator_events where id=p_creator_event_id for update;
  if e.id is null or e.host_user_id is distinct from auth.uid() then raise exception 'event_creator_required'; end if;
  if p_expected_updated_at is not null and (not isfinite(p_expected_updated_at) or e.updated_at is distinct from p_expected_updated_at)
  then raise exception 'event_changed_refresh_required'; end if;
  if lower(coalesce(p_status,'')) not in('draft','sandbox','active','paused')
  then raise exception 'event_sale_status_invalid'; end if;
  if lower(p_status)='draft' and exists(select 1 from public.paid_creator_events
    where creator_event_id=e.id and status in('sandbox','active','sold_out','paused','blocked'))
  then raise exception 'event_published_offer_cannot_become_draft'; end if;
  if lower(coalesce(p_status,'')) in('sandbox','active') and exists(
    select 1 from public.room_broadcast_sessions b where b.creator_event_id=e.id::text
      and b.ended_at is null and b.broadcast_status='active_later' and b.access_type<>'ticketed')
  then raise exception 'event_stop_public_broadcast_before_paid_sale'; end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=p_time_zone)
    or p_time_zone like 'posix/%' or p_time_zone like 'right/%'
  then raise exception 'event_time_zone_invalid'; end if;
  if e.starts_at is null or e.ends_at is null or not isfinite(e.starts_at) or not isfinite(e.ends_at) or e.ends_at<=e.starts_at
    or p_sales_open_at is null or p_sales_close_at is null or p_sales_close_at<=p_sales_open_at
    or not isfinite(p_sales_open_at) or not isfinite(p_sales_close_at) or p_sales_close_at>e.ends_at
  then raise exception 'event_sale_window_invalid'; end if;
  if e.replay_policy='until_expiration' and (e.replay_expires_at is null
    or not isfinite(e.replay_expires_at) or e.replay_expires_at<=e.ends_at)
  then raise exception 'event_replay_expiry_must_follow_show'; end if;
  if nullif(btrim(p_description),'') is null or length(p_description)>2000 then raise exception 'event_inclusions_required'; end if;
  if p_capacity_limit is not null and (p_capacity_limit<=0
    or p_capacity_limit<public.event_ticket_inventory_internal(e.id))
  then raise exception 'event_capacity_below_committed'; end if;
  if lower(coalesce(p_status,'')) in('sandbox','active') and p_sales_close_at<=clock_timestamp()
  then raise exception 'event_sales_closed'; end if;
  update public.creator_events set time_zone=p_time_zone where id=e.id and time_zone is distinct from p_time_zone;
  v_status:=lower(coalesce(p_status,''));
  if v_status='paused' then
    select * into o from public.paid_creator_events where creator_event_id=e.id
      and status in('active','sandbox') for update;
    if o.id is null then raise exception 'event_active_offer_required'; end if;
    v_status:=o.status;
  end if;
  v_id:=(public.set_paid_creator_event_offer(e.id,p_description,p_price_cents,p_capacity_limit,v_status)->>'id')::uuid;
  select * into o from public.paid_creator_events where id=v_id for update;
  select coalesce(max(revision),0)+1 into v_revision from public.creator_event_offer_revisions where offer_id=o.id;
  insert into public.creator_event_offer_revisions(offer_id,creator_event_id,creator_id,revision,terms)
  values(o.id,e.id,e.host_user_id,v_revision,jsonb_build_object(
    'title',o.title,'description',o.description,'priceCents',o.price_cents,'currency',o.currency,
    'startsAt',e.starts_at,'endsAt',e.ends_at,'timeZone',p_time_zone,
    'salesOpenAt',p_sales_open_at,'salesCloseAt',p_sales_close_at,'capacityLimit',p_capacity_limit,
    'attendance','virtual','replayPolicy',e.replay_policy,'replayAvailableAt',e.replay_available_at,
    'replayExpiresAt',e.replay_expires_at)) returning id into v_id;
  update public.paid_creator_events set current_terms_revision_id=v_id,
    sales_paused=lower(coalesce(p_status,''))='paused' where id=o.id returning * into o;
  return public.paid_creator_event_safe_row(o);
end;
$$;
revoke all on function public.configure_paid_creator_event_sale(uuid,text,integer,integer,text,text,timestamptz,timestamptz,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.configure_paid_creator_event_sale(uuid,text,integer,integer,text,text,timestamptz,timestamptz,timestamptz) to authenticated;

-- BEFORE INSERT binds every event intent path, including generic/old clients.
create function private.bind_event_ticket_purchase_terms()
returns trigger language plpgsql security definer set search_path='' as $$
declare e public.creator_events; o public.paid_creator_events; v public.creator_event_offer_revisions;
begin
  if tg_op='UPDATE' then
    if new.event_terms_revision_id is distinct from old.event_terms_revision_id then raise exception 'event_ticket_terms_immutable'; end if;
    return new;
  end if;
  if new.product_type<>'event_pass' then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'creator-money-source-intent:'||new.user_id::text||':event:'||new.source_id::text,0));
  select * into e from public.creator_events where id=new.source_id for update;
  if e.id is null or e.status not in('scheduled','live_now') then raise exception 'event_unavailable'; end if;
  select * into o from public.paid_creator_events where creator_event_id=e.id
    and status=case when new.environment='production' then 'active' else 'sandbox' end for update;
  if o.id is null or o.current_terms_revision_id is null then raise exception 'event_terms_required'; end if;
  if o.sales_paused then raise exception 'event_sales_paused'; end if;
  select * into v from public.creator_event_offer_revisions where id=o.current_terms_revision_id;
  if v.offer_id is distinct from o.id or v.creator_event_id is distinct from e.id
    or new.source_type<>'event' or new.creator_id is distinct from o.creator_id
    or new.amount_minor is distinct from (v.terms->>'priceCents')::integer
    or lower(new.currency) is distinct from v.terms->>'currency'
    or o.price_cents is distinct from (v.terms->>'priceCents')::integer
    or o.currency is distinct from v.terms->>'currency'
    or o.capacity_limit is distinct from (v.terms->>'capacityLimit')::integer
    or e.starts_at is distinct from (v.terms->>'startsAt')::timestamptz
    or e.ends_at is distinct from (v.terms->>'endsAt')::timestamptz
    or e.time_zone is distinct from v.terms->>'timeZone'
    or e.replay_policy is distinct from v.terms->>'replayPolicy'
    or e.replay_available_at is distinct from (v.terms->>'replayAvailableAt')::timestamptz
    or e.replay_expires_at is distinct from (v.terms->>'replayExpiresAt')::timestamptz
  then raise exception 'event_terms_changed'; end if;
  if clock_timestamp()<(v.terms->>'salesOpenAt')::timestamptz then raise exception 'event_sales_not_open'; end if;
  if clock_timestamp()>=(v.terms->>'salesCloseAt')::timestamptz then raise exception 'event_sales_closed'; end if;
  if o.capacity_limit is not null and public.event_ticket_inventory_internal(e.id)>=o.capacity_limit
  then raise exception 'event_sold_out'; end if;
  new.event_terms_revision_id:=v.id;
  return new;
end;
$$;
create trigger bind_event_ticket_purchase_terms before insert or update of event_terms_revision_id on public.money_purchase_intents
for each row execute function private.bind_event_ticket_purchase_terms();
revoke all on function private.bind_event_ticket_purchase_terms() from public,anon,authenticated,service_role;

create function private.reserve_event_ticket_after_intent()
returns trigger language plpgsql security definer set search_path='' as $$
declare v public.creator_event_offer_revisions;
begin
  if new.product_type<>'event_pass' then return new; end if;
  select * into strict v from public.creator_event_offer_revisions where id=new.event_terms_revision_id;
  insert into public.event_ticket_reservations(purchase_intent_id,revision_id,buyer_id,creator_event_id,offer_id,expires_at)
  values(new.id,v.id,new.user_id,v.creator_event_id,v.offer_id,
    least(new.expires_at,(v.terms->>'salesCloseAt')::timestamptz));
  return new;
end;
$$;
create trigger reserve_event_ticket_after_intent after insert on public.money_purchase_intents
for each row execute function private.reserve_event_ticket_after_intent();
revoke all on function private.reserve_event_ticket_after_intent() from public,anon,authenticated,service_role;

create function public.read_my_creator_event_reservation(p_purchase_intent_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.event_ticket_reservations; i public.money_purchase_intents;
  e public.creator_events; o public.paid_creator_events; v public.creator_event_offer_revisions;
begin
  if auth.uid() is null or not public.wave1_current_caller_authority_internal()
    or public.is_account_access_restricted(auth.uid()::text)
  then raise exception 'buyer_session_authority_required'; end if;
  select * into i from public.money_purchase_intents where id=p_purchase_intent_id and user_id=auth.uid();
  if i.id is null then raise exception 'event_reservation_not_found'; end if;
  select * into r from public.event_ticket_reservations where purchase_intent_id=i.id and buyer_id=auth.uid();
  if r.id is null then raise exception 'event_reservation_not_found'; end if;
  if r.state='held' and (i.session_generation is distinct from nullif(auth.jwt()->>'session_id','')
    or i.status<>'pending' or i.revoked_at is not null)
  then raise exception 'event_reservation_session_changed'; end if;
  if r.state='held' and r.expires_at>clock_timestamp() then
    select * into e from public.creator_events where id=r.creator_event_id;
    select * into o from public.paid_creator_events where id=r.offer_id;
    select * into v from public.creator_event_offer_revisions where id=r.revision_id;
    if e.id is null or e.status not in('scheduled','live_now') or o.id is null or o.status in('canceled','blocked')
      or not public.wave1_creator_money_subject_authorized_internal(i.creator_id)
      or clock_timestamp()>=(v.terms->>'endsAt')::timestamptz
    then raise exception 'event_reservation_source_unavailable'; end if;
    if e.starts_at is distinct from (v.terms->>'startsAt')::timestamptz
      or e.ends_at is distinct from (v.terms->>'endsAt')::timestamptz
      or e.time_zone is distinct from v.terms->>'timeZone'
      or e.replay_policy is distinct from v.terms->>'replayPolicy'
      or e.replay_available_at is distinct from (v.terms->>'replayAvailableAt')::timestamptz
      or e.replay_expires_at is distinct from (v.terms->>'replayExpiresAt')::timestamptz
    then raise exception 'event_reservation_terms_changed'; end if;
  end if;
  return public.event_ticket_reservation_safe_row(r);
end;
$$;
revoke all on function public.read_my_creator_event_reservation(uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_my_creator_event_reservation(uuid) to authenticated;

create function public.create_reserved_creator_event_purchase_intent(p_event_id uuid,p_expected_revision_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.paid_creator_events; result jsonb; r public.event_ticket_reservations;
begin
  if auth.uid() is null or not public.wave1_current_caller_authority_internal() then raise exception 'buyer_session_authority_required'; end if;
  select * into o from public.paid_creator_events where id=p_event_id;
  if o.id is null then raise exception 'offer_not_found'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'creator-money-source-intent:'||auth.uid()::text||':event:'||o.creator_event_id::text,0));
  perform 1 from public.creator_events where id=o.creator_event_id for update;
  select * into o from public.paid_creator_events where id=p_event_id for update;
  if p_expected_revision_id is null or o.current_terms_revision_id is distinct from p_expected_revision_id
  then raise exception 'event_terms_changed'; end if;
  result:=public.create_paid_creator_event_pass_purchase_intent(p_event_id);
  if coalesce((result->>'alreadyPurchased')::boolean,false) then return result; end if;
  select * into r from public.event_ticket_reservations where purchase_intent_id=(result->>'id')::uuid;
  if r.id is null or r.revision_id is distinct from p_expected_revision_id then raise exception 'event_reservation_not_found'; end if;
  return result||jsonb_build_object('reservation',public.event_ticket_reservation_safe_row(r));
end;
$$;
revoke all on function public.create_reserved_creator_event_purchase_intent(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.create_reserved_creator_event_purchase_intent(uuid,uuid) to authenticated;

-- Preserve historical paid identity and free-event semantics. New checkout
-- availability is an additional decision only after access has been denied.
alter function public.resolve_paid_creator_event_pass_access(uuid)
rename to resolve_paid_creator_event_pass_access_pre_reservations;
revoke all on function public.resolve_paid_creator_event_pass_access_pre_reservations(uuid) from public,anon,authenticated,service_role;
create function public.resolve_paid_creator_event_pass_access(p_creator_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; o public.paid_creator_events; r public.event_ticket_reservations;
  v public.creator_event_offer_revisions; reason text;
begin
  result:=public.resolve_paid_creator_event_pass_access_pre_reservations(p_creator_event_id);
  if coalesce((result->>'allowed')::boolean,false)
    or not coalesce((result->>'requiresPurchase')::boolean,false)
    or auth.uid() is null or not public.wave1_current_caller_authority_internal()
  then return result; end if;
  select * into o from public.paid_creator_events where id=(result->'offer'->>'id')::uuid;
  if o.id is null then return result; end if;
  select * into r from public.event_ticket_reservations where creator_event_id=p_creator_event_id
    and buyer_id=auth.uid() and (state in('fulfilling','reconciliation_required')
      or (state='held' and expires_at>clock_timestamp())) order by created_at desc limit 1;
  if r.state='reconciliation_required' then reason:='event_reconciliation_required';
  elsif r.id is not null then reason:='event_reservation_pending';
  elsif o.sales_paused then reason:='event_sales_paused';
  elsif o.current_terms_revision_id is null then reason:='event_terms_required';
  else
    select * into v from public.creator_event_offer_revisions where id=o.current_terms_revision_id;
    if clock_timestamp()<(v.terms->>'salesOpenAt')::timestamptz then reason:='event_sales_not_open';
    elsif clock_timestamp()>=(v.terms->>'salesCloseAt')::timestamptz then reason:='event_sales_closed';
    elsif o.capacity_limit is not null and public.event_ticket_inventory_internal(p_creator_event_id)>=o.capacity_limit
    then reason:='sold_out'; end if;
  end if;
  if reason is not null then return result||jsonb_build_object('reason',reason,'requiresPurchase',false); end if;
  return result;
end;
$$;
revoke all on function public.resolve_paid_creator_event_pass_access(uuid) from public,anon,authenticated,service_role;
grant execute on function public.resolve_paid_creator_event_pass_access(uuid) to authenticated,service_role;

-- Called only inside the existing source-locked provider transaction. NULL is
-- success; a failure reason is passed to the existing durable ignored-charge
-- recorder. Never throws away verified payment evidence or promises a refund.
create function public.event_ticket_reservation_failure_internal(
  p_purchase_intent_id uuid,p_buyer_id uuid,p_provider_event_id text
)
returns text language plpgsql security definer set search_path='' as $$
declare r public.event_ticket_reservations; i public.money_purchase_intents;
  o public.paid_creator_events; v public.creator_event_offer_revisions; e public.creator_events;
  failure text;
begin
  select * into i from public.money_purchase_intents where id=p_purchase_intent_id;
  if i.id is null or i.user_id is distinct from p_buyer_id or i.product_type<>'event_pass'
  then return 'event_reservation_identity_invalid'; end if;
  select * into e from public.creator_events where id=i.source_id for update;
  select * into r from public.event_ticket_reservations where purchase_intent_id=i.id;
  if r.id is null then return 'event_reservation_missing'; end if;
  select * into o from public.paid_creator_events where id=r.offer_id for update;
  select * into r from public.event_ticket_reservations where purchase_intent_id=i.id for update;
  select * into v from public.creator_event_offer_revisions where id=r.revision_id;
  if r.buyer_id is distinct from p_buyer_id or r.creator_event_id is distinct from i.source_id
    or i.event_terms_revision_id is distinct from v.id or v.offer_id is distinct from o.id
    or v.creator_id is distinct from i.creator_id or v.creator_event_id is distinct from i.source_id
    or i.amount_minor is distinct from (v.terms->>'priceCents')::integer
    or lower(i.currency) is distinct from v.terms->>'currency'
    or nullif(btrim(p_provider_event_id),'') is null
  then failure:='event_reservation_identity_invalid';
  elsif r.state='fulfilled' and r.fulfilling_provider_event_id=p_provider_event_id then
    return null;
  elsif r.state='fulfilling' and r.fulfilling_provider_event_id=p_provider_event_id then
    return null;
  elsif r.state<>'held' then failure:='event_reservation_not_held';
  elsif e.id is null or e.status not in('scheduled','live_now','replay_available')
    or o.id is null or o.status in('canceled','blocked')
  then failure:='event_reservation_source_unavailable';
  elsif e.starts_at is distinct from (v.terms->>'startsAt')::timestamptz
    or e.ends_at is distinct from (v.terms->>'endsAt')::timestamptz
    or e.time_zone is distinct from v.terms->>'timeZone'
    or e.replay_policy is distinct from v.terms->>'replayPolicy'
    or e.replay_available_at is distinct from (v.terms->>'replayAvailableAt')::timestamptz
    or e.replay_expires_at is distinct from (v.terms->>'replayExpiresAt')::timestamptz
  then failure:='event_reservation_terms_changed';
  elsif r.expires_at<=clock_timestamp() then
    -- Owner-approved recovery: a late receipt may claim a still-free place,
    -- under the same event lock, only while its original show terms are valid.
    -- Never displace another buyer's hold or silently accept a changed show.
    if e.status not in('scheduled','live_now')
      or clock_timestamp()>=(v.terms->>'endsAt')::timestamptz
      or e.starts_at is distinct from (v.terms->>'startsAt')::timestamptz
      or e.ends_at is distinct from (v.terms->>'endsAt')::timestamptz
      or e.time_zone is distinct from v.terms->>'timeZone'
      or e.replay_policy is distinct from v.terms->>'replayPolicy'
      or e.replay_available_at is distinct from (v.terms->>'replayAvailableAt')::timestamptz
      or e.replay_expires_at is distinct from (v.terms->>'replayExpiresAt')::timestamptz
    then failure:='event_reservation_expired_terms_changed';
    elsif o.capacity_limit is not null and public.event_ticket_inventory_internal(e.id)>=o.capacity_limit
    then failure:='event_reservation_expired_sold_out';
    end if;
  end if;
  if failure is not null then
    if r.state<>'fulfilled' then
      update public.event_ticket_reservations set state='reconciliation_required',reason=failure,
        updated_at=clock_timestamp() where id=r.id;
    end if;
    return failure;
  end if;
  update public.event_ticket_reservations set state='fulfilling',fulfilling_provider_event_id=p_provider_event_id,
    updated_at=clock_timestamp() where id=r.id;
  return null;
end;
$$;
revoke all on function public.event_ticket_reservation_failure_internal(uuid,uuid,text) from public,anon,authenticated,service_role;

create function public.finalize_event_ticket_reservation_internal(
  p_purchase_intent_id uuid,p_buyer_id uuid,p_provider_event_id text,p_result jsonb
)
returns void language plpgsql security definer set search_path='' as $$
declare r public.event_ticket_reservations;
begin
  select * into r from public.event_ticket_reservations
  where purchase_intent_id=p_purchase_intent_id and buyer_id=p_buyer_id for update;
  if r.id is null or r.state='fulfilled' then return; end if;
  if r.state='fulfilling' and r.fulfilling_provider_event_id=p_provider_event_id then
    update public.event_ticket_reservations set state='reconciliation_required',
      reason=coalesce(nullif(p_result->>'reason',''),'event_reservation_fulfillment_unconfirmed'),
      updated_at=clock_timestamp() where id=r.id;
  end if;
end;
$$;
revoke all on function public.finalize_event_ticket_reservation_internal(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;

-- These identities never change after reservation. Access and state transition
-- mutations are available only to the internal provider functions, not APIs.
create function private.guard_event_ticket_reservation_identity()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'event_ticket_reservation_immutable'; end if;
  if row(new.id,new.purchase_intent_id,new.revision_id,new.buyer_id,new.creator_event_id,new.offer_id,new.expires_at,new.created_at)
    is distinct from row(old.id,old.purchase_intent_id,old.revision_id,old.buyer_id,old.creator_event_id,old.offer_id,old.expires_at,old.created_at)
  then raise exception 'event_ticket_reservation_immutable'; end if;
  if old.state='fulfilled' and row(new.state,new.fulfilling_provider_event_id,new.access_grant_id)
    is distinct from row(old.state,old.fulfilling_provider_event_id,old.access_grant_id)
  then raise exception 'event_ticket_fulfillment_immutable'; end if;
  return new;
end;
$$;
create trigger guard_event_ticket_reservation_identity before update or delete on public.event_ticket_reservations
for each row execute function private.guard_event_ticket_reservation_identity();
revoke all on function private.guard_event_ticket_reservation_identity() from public,anon,authenticated,service_role;

-- Active ticket grants must have passed the reservation admission check in the
-- same provider transaction. A reservation's immutable replay terms bound its
-- maximum access window; provider expiry can further shorten it.
create function private.require_event_ticket_reservation_for_grant()
returns trigger language plpgsql security definer set search_path='' as $$
declare r public.event_ticket_reservations; v public.creator_event_offer_revisions; boundary timestamptz;
begin
  if new.grant_type<>'event_pass' or new.status not in('active','sandbox_only') then return new; end if;
  select * into r from public.event_ticket_reservations
  where purchase_intent_id::text=new.metadata->>'purchase_intent_id' and buyer_id=new.user_id;
  if r.id is null and tg_op='UPDATE' then
    if old.status in('active','sandbox_only') and old.source_id is not distinct from new.source_id
      and old.user_id is not distinct from new.user_id
    then return new; end if;
  end if;
  if r.id is null or r.state not in('fulfilling','fulfilled')
    or r.creator_event_id is distinct from new.source_id
    or (r.state='fulfilled' and r.access_grant_id is distinct from new.id)
    or not exists(select 1 from public.provider_events p where p.id=new.provider_event_id
      and p.user_id=new.user_id and p.provider_event_id=r.fulfilling_provider_event_id)
  then raise exception 'event_reservation_required'; end if;
  select * into strict v from public.creator_event_offer_revisions where id=r.revision_id;
  boundary:=case v.terms->>'replayPolicy'
    when 'none' then (v.terms->>'endsAt')::timestamptz
    when 'until_expiration' then (v.terms->>'replayExpiresAt')::timestamptz else null end;
  if boundary is not null then new.expires_at:=least(coalesce(new.expires_at,boundary),boundary); end if;
  return new;
end;
$$;
create trigger require_event_ticket_reservation_for_grant before insert or update on public.access_grants
for each row execute function private.require_event_ticket_reservation_for_grant();
revoke all on function private.require_event_ticket_reservation_for_grant() from public,anon,authenticated,service_role;

create or replace function public."sync_paid_creator_event_pass_from_access_grant"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer public."paid_creator_events"%rowtype;
  v_provider public."provider_events"%rowtype;
  v_ledger public."money_access_ledger_events"%rowtype;
  v_transaction public."creator_event_transactions"%rowtype;
  v_pass public."paid_creator_event_passes"%rowtype;
  v_active boolean;
  v_reservation public.event_ticket_reservations%rowtype;
begin
  if new."grant_type" <> 'event_pass' or new."source_id" is null then
    return new;
  end if;

  select * into v_reservation from public.event_ticket_reservations
  where purchase_intent_id::text=new.metadata->>'purchase_intent_id'
    and buyer_id=new.user_id;
  if v_reservation.id is not null then
    select * into v_offer from public.paid_creator_events where id=v_reservation.offer_id;
  else
    -- Terminal updates for existing legacy grants keep their actual historical
    -- pass offer. New active grants require a reservation in the BEFORE guard.
    select offer.* into v_offer from public.paid_creator_events offer
    join public.paid_creator_event_passes pass on pass.event_id=offer.id
    where pass.access_grant_id=new.id and pass.buyer_id=new.user_id
    order by pass.created_at desc limit 1;
  end if;

  if v_offer."id" is null then
    return new;
  end if;

  select * into v_provider
  from public."provider_events"
  where "id" = new."provider_event_id"
  limit 1;

  select * into v_ledger
  from public."money_access_ledger_events"
  where "provider_event_id" = new."provider_event_id"
  limit 1;

  v_active := new."status" in ('active', 'sandbox_only')
    and new."refunded_at" is null
    and new."revoked_at" is null
    and new."starts_at" <= timezone('utc'::text, now())
    and (new."expires_at" is null or new."expires_at" > timezone('utc'::text, now()));

  insert into public."creator_event_transactions" (
    "event_id",
    "creator_event_id",
    "creator_id",
    "buyer_id",
    "amount_cents",
    "currency",
    "provider",
    "provider_product_id",
    "provider_transaction_id",
    "provider_event_id",
    "ledger_event_id",
    "status",
    "payout_status",
    "paid_at",
    "refunded_at",
    "metadata"
  )
  values (
    v_offer."id",
    v_offer."creator_event_id",
    v_offer."creator_id",
    new."user_id",
    coalesce(v_ledger."amount_minor", v_offer."price_cents"),
    coalesce(v_ledger."currency", v_offer."currency"),
    coalesce(new."provider", 'revenuecat_google_play'),
    coalesce(v_provider."metadata"->>'provider_product_id', v_offer."provider_product_id"),
    v_provider."provider_event_id",
    new."provider_event_id",
    v_ledger."id",
    case when v_active then 'paid' when new."status" = 'refunded' then 'refunded' when new."status" = 'revoked' then 'revoked' else 'pending' end,
    coalesce(v_ledger."payable_state", 'not_payable'),
    case when v_active then timezone('utc'::text, now()) else null end,
    new."refunded_at",
    jsonb_build_object(
      'sandbox_only', new."environment" = 'sandbox',
      'premium_unlock', false,
      'tips_path', false,
      'paid_video_unlock', false,
      'paid_watch_party_ticket_unlock', false,
      'vip_unlock', false,
      'subscription_unlock', false,
      'room_media_controls', false,
      'grants_host_authority', false
    )
  )
  on conflict ("provider_event_id")
  where "provider_event_id" is not null
  do update set
    "status" = excluded."status",
    "payout_status" = excluded."payout_status",
    "refunded_at" = excluded."refunded_at",
    "metadata" = excluded."metadata"
  returning * into v_transaction;

  if v_active then
    if v_offer."capacity_limit" is not null
      and not exists (
        select 1
        from public."paid_creator_event_passes" existing_pass
        where existing_pass."event_id" = v_offer."id"
          and existing_pass."buyer_id" = new."user_id"
          and existing_pass."status" = 'active'
      )
      and (
        select count(*)::integer
        from public."paid_creator_event_passes" event_pass
        where event_pass."event_id" = v_offer."id"
          and event_pass."status" = 'active'
          and event_pass."refunded_at" is null
          and event_pass."revoked_at" is null
          and (event_pass."expires_at" is null or event_pass."expires_at" > timezone('utc'::text, now()))
      ) >= v_offer."capacity_limit"
    then
      update public."creator_event_transactions"
      set
        "status" = 'canceled',
        "metadata" = "metadata" || jsonb_build_object('blocked_reason', 'sold_out', 'access_granted', false)
      where "id" = v_transaction."id";

      update public."paid_creator_events"
      set
        "status" = 'sold_out',
        "updated_at" = timezone('utc'::text, now())
      where "id" = v_offer."id";

      insert into public."paid_event_events" ("event_id", "transaction_id", "actor_id", "event_type", "metadata")
      values (
        v_offer."id",
        v_transaction."id",
        new."user_id",
        'pass_blocked_sold_out',
        jsonb_build_object('provider_event_id', new."provider_event_id", 'sandbox_only', new."environment" = 'sandbox')
      );

      return new;
    end if;

    insert into public."paid_creator_event_passes" (
      "event_id",
      "creator_event_id",
      "buyer_id",
      "creator_id",
      "source_transaction_id",
      "access_grant_id",
      "provider",
      "provider_transaction_id",
      "status",
      "expires_at",
      "metadata"
    )
    values (
      v_offer."id",
      v_offer."creator_event_id",
      new."user_id",
      v_offer."creator_id",
      v_transaction."id",
      new."id",
      coalesce(new."provider", 'revenuecat_google_play'),
      v_provider."provider_event_id",
      'active',
      new."expires_at",
      jsonb_build_object(
        'sandbox_only', new."environment" = 'sandbox',
        'viewer_access_only', true,
        'room_media_controls', false,
        'grants_host_authority', false
      )
    )
    on conflict ("event_id", "buyer_id")
    where "status" = 'active'
    do update set
      "access_grant_id" = excluded."access_grant_id",
      "source_transaction_id" = excluded."source_transaction_id",
      "provider_transaction_id" = excluded."provider_transaction_id",
      "expires_at" = excluded."expires_at"
    returning * into v_pass;

    update public."paid_creator_events" offer
    set
      "passes_sold" = (
        select count(*)::integer
        from public."paid_creator_event_passes" event_pass
        where event_pass."event_id" = offer."id"
          and event_pass."status" = 'active'
          and event_pass."refunded_at" is null
          and event_pass."revoked_at" is null
          and (event_pass."expires_at" is null or event_pass."expires_at" > timezone('utc'::text, now()))
      ),
      "status" = case
        when offer."capacity_limit" is not null
          and (
            select count(*)::integer
            from public."paid_creator_event_passes" event_pass
            where event_pass."event_id" = offer."id"
              and event_pass."status" = 'active'
              and event_pass."refunded_at" is null
              and event_pass."revoked_at" is null
          ) >= offer."capacity_limit"
        then 'sold_out'
        else offer."status"
      end,
      "updated_at" = timezone('utc'::text, now())
    where offer."id" = v_offer."id";
  else
    update public."paid_creator_event_passes"
    set
      "status" = case when new."status" = 'refunded' then 'refunded' when new."status" = 'revoked' then 'revoked' else 'expired' end,
      "refunded_at" = new."refunded_at",
      "revoked_at" = coalesce(new."revoked_at", timezone('utc'::text, now()))
    where "access_grant_id" = new."id"
      and "status" = 'active';
  end if;

  insert into public."paid_event_events" ("event_id", "pass_id", "transaction_id", "actor_id", "event_type", "metadata")
  values (
    v_offer."id",
    v_pass."id",
    v_transaction."id",
    new."user_id",
    case when v_active then 'event_pass_verified' else 'event_pass_revoked' end,
    jsonb_build_object('provider_event_id', new."provider_event_id", 'sandbox_only', new."environment" = 'sandbox')
  );

  if v_active and v_reservation.id is not null and v_pass.id is not null then
    update public.event_ticket_reservations set state='fulfilled',access_grant_id=new.id,
      updated_at=clock_timestamp() where id=v_reservation.id and state='fulfilling';
  end if;

  return new;
end;
$$;
