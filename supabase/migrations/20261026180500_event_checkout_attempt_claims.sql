-- One reservation authorizes at most one native checkout start. This is an
-- application attempt marker, never proof of provider payment or cancellation.
alter table public.event_ticket_reservations
  add column checkout_attempt_id uuid,
  add column checkout_started_at timestamptz,
  add constraint event_ticket_checkout_marker_complete check (
    (checkout_attempt_id is null) = (checkout_started_at is null));
create unique index event_ticket_checkout_attempt_unique
  on public.event_ticket_reservations(checkout_attempt_id) where checkout_attempt_id is not null;

create function private.guard_event_checkout_attempt_identity()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.checkout_attempt_id is not null and
    row(new.checkout_attempt_id,new.checkout_started_at)
      is distinct from row(old.checkout_attempt_id,old.checkout_started_at)
  then raise exception 'event_checkout_attempt_immutable'; end if;
  return new;
end;
$$;
create trigger guard_event_checkout_attempt_identity before update on public.event_ticket_reservations
for each row execute function private.guard_event_checkout_attempt_identity();
revoke all on function private.guard_event_checkout_attempt_identity() from public,anon,authenticated,service_role;

create function public.begin_creator_event_checkout(p_purchase_intent_id uuid,p_checkout_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.money_purchase_intents; r public.event_ticket_reservations; verified jsonb;
begin
  if auth.uid() is null or not public.wave1_current_caller_authority_internal()
    or public.is_account_access_restricted(auth.uid()::text)
  then raise exception 'buyer_session_authority_required'; end if;
  if p_checkout_attempt_id is null then raise exception 'event_checkout_attempt_required'; end if;
  select * into i from public.money_purchase_intents where id=p_purchase_intent_id and user_id=auth.uid();
  if i.id is null or i.source_type<>'event' or i.product_type<>'event_pass'
  then raise exception 'event_reservation_not_found'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'creator-money-source-intent:'||auth.uid()::text||':event:'||i.source_id::text,0));
  perform 1 from public.creator_events where id=i.source_id for update;
  select * into i from public.money_purchase_intents where id=p_purchase_intent_id for update;
  select * into r from public.event_ticket_reservations where purchase_intent_id=i.id and buyer_id=auth.uid() for update;
  if r.id is null then raise exception 'event_reservation_not_found'; end if;
  -- Recheck all current account, source, immutable terms and expiry conditions
  -- while creator changes, receipt admission and competing starts are locked.
  verified:=public.read_my_creator_event_reservation(i.id);
  if r.state<>'held' or r.expires_at<=clock_timestamp() or i.expires_at<=clock_timestamp()
    or i.status<>'pending' or i.revoked_at is not null
    or i.session_generation is distinct from nullif(auth.jwt()->>'session_id','')
  then raise exception 'event_checkout_reservation_unavailable'; end if;
  if r.checkout_attempt_id is not null then
    -- Even the same UUID cannot authorize a second SDK call after a lost reply.
    return verified||jsonb_build_object('checkoutAttemptId',r.checkout_attempt_id,
      'checkoutStartedAt',r.checkout_started_at,'startAuthorized',false);
  end if;
  update public.event_ticket_reservations set checkout_attempt_id=p_checkout_attempt_id,
    checkout_started_at=clock_timestamp(),updated_at=clock_timestamp()
    where id=r.id returning * into r;
  return public.event_ticket_reservation_safe_row(r)||jsonb_build_object(
    'checkoutAttemptId',r.checkout_attempt_id,'checkoutStartedAt',r.checkout_started_at,'startAuthorized',true);
end;
$$;
revoke all on function public.begin_creator_event_checkout(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.begin_creator_event_checkout(uuid,uuid) to authenticated;

create function public.cancel_unstarted_creator_event_reservation(p_purchase_intent_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.money_purchase_intents; r public.event_ticket_reservations;
begin
  if auth.uid() is null or not public.wave1_current_caller_authority_internal()
    or public.is_account_access_restricted(auth.uid()::text)
  then raise exception 'buyer_session_authority_required'; end if;
  select * into i from public.money_purchase_intents where id=p_purchase_intent_id and user_id=auth.uid();
  if i.id is null or i.source_type<>'event' or i.product_type<>'event_pass'
  then raise exception 'event_reservation_not_found'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'creator-money-source-intent:'||auth.uid()::text||':event:'||i.source_id::text,0));
  perform 1 from public.creator_events where id=i.source_id for update;
  select * into i from public.money_purchase_intents where id=p_purchase_intent_id for update;
  select * into r from public.event_ticket_reservations where purchase_intent_id=i.id and buyer_id=auth.uid() for update;
  if r.id is null then raise exception 'event_reservation_not_found'; end if;
  if i.session_generation is distinct from nullif(auth.jwt()->>'session_id','')
  then raise exception 'event_reservation_session_changed'; end if;
  if r.checkout_attempt_id is not null then raise exception 'event_checkout_already_started'; end if;
  if r.state='canceled' and i.status='cancelled' then
    return public.event_ticket_reservation_safe_row(r);
  end if;
  if r.state<>'held' or i.status<>'pending' or i.consumed_at is not null or i.revoked_at is not null
  then raise exception 'event_checkout_reservation_unavailable'; end if;
  update public.money_purchase_intents set status='cancelled',updated_at=clock_timestamp() where id=i.id;
  update public.event_ticket_reservations set state='canceled',reason='checkout_not_started',
    updated_at=clock_timestamp() where id=r.id returning * into r;
  return public.event_ticket_reservation_safe_row(r);
end;
$$;
revoke all on function public.cancel_unstarted_creator_event_reservation(uuid) from public,anon,authenticated,service_role;
grant execute on function public.cancel_unstarted_creator_event_reservation(uuid) to authenticated;
