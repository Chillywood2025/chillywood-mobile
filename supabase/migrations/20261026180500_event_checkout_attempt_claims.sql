-- One reservation authorizes at most one native checkout start. This is an
-- application attempt marker, never proof of provider payment or cancellation.
alter table public.event_ticket_reservations
  add column checkout_attempt_id uuid,
  add column checkout_started_at timestamptz,
  add constraint event_ticket_checkout_marker_complete check (
    (checkout_attempt_id is null) = (checkout_started_at is null));
create unique index event_ticket_checkout_attempt_unique
  on public.event_ticket_reservations(checkout_attempt_id) where checkout_attempt_id is not null;

-- Expiring inventory does not cancel a Store transaction. This predicate is
-- buyer/event scoped, deliberately independent of the issuing login session.
create function private.event_checkout_resolution_required(
  p_buyer_id uuid,p_creator_event_id uuid,p_except_reservation_id uuid default null
)
returns boolean language sql volatile security definer set search_path='' as $$
  select exists(select 1 from public.event_ticket_reservations r
    where r.buyer_id=p_buyer_id and r.creator_event_id=p_creator_event_id
      and r.id is distinct from p_except_reservation_id
      and r.checkout_attempt_id is not null
      and r.state in('held','fulfilling','expired','reconciliation_required'));
$$;
revoke all on function private.event_checkout_resolution_required(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function private.guard_event_checkout_replacement()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.source_type='event' and new.product_type='event_pass' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'creator-money-source-intent:'||new.user_id::text||':event:'||new.source_id::text,0));
    if private.event_checkout_resolution_required(new.user_id,new.source_id)
    then raise exception 'event_checkout_resolution_required'; end if;
  end if;
  return new;
end;
$$;
create trigger guard_event_checkout_replacement before insert on public.money_purchase_intents
for each row execute function private.guard_event_checkout_replacement();
revoke all on function private.guard_event_checkout_replacement() from public,anon,authenticated,service_role;

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
  q public.creator_money_purchase_quotes; switch_key text; switch_state text;
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
  if private.event_checkout_resolution_required(i.user_id,i.source_id,r.id)
  then raise exception 'event_checkout_resolution_required'; end if;
  if i.consumed_at is not null or i.creator_id=i.user_id
    or not public.money_purchase_intent_session_authorized_internal(i.user_id,i.session_generation)
    or public.revenuecat_authority_quarantined_internal(i.provider,i.user_id,i.environment)
    or not public.can_read_creator_event(i.source_id,i.user_id)
    or not exists(select 1 from public.creator_events e join public.paid_creator_events o
      on o.creator_event_id=e.id where e.id=i.source_id and o.id=r.offer_id
      and e.host_user_id=i.creator_id and o.creator_id=i.creator_id
      and o.status in(case i.environment when 'production' then 'active' else 'sandbox' end,'sold_out','paused'))
  then raise exception 'event_checkout_source_unavailable'; end if;
  if exists(select 1 from public.channel_audience_blocks b
    where (b.channel_user_id=i.creator_id::text and b.blocked_user_id=i.user_id::text)
      or (b.channel_user_id=i.user_id::text and b.blocked_user_id=i.creator_id::text))
  then raise exception 'event_checkout_blocked_by_audience_policy'; end if;
  select * into q from public.creator_money_purchase_quotes where purchase_intent_id=i.id;
  if q.purchase_intent_id is null or row(q.user_id,q.creator_id,q.source_type,q.source_id,q.amount_minor,q.currency,
      q.provider,q.provider_product_id,q.environment,q.created_at,q.expires_at)
    is distinct from row(i.user_id,i.creator_id,i.source_type,i.source_id,i.amount_minor,i.currency,
      i.provider,i.provider_product_id,i.environment,i.created_at,i.expires_at)
  then raise exception 'event_checkout_quote_mismatch'; end if;
  -- Revalidate the original immutable price, not the creator's newer offer.
  if i.provider not in('revenuecat_app_store','revenuecat_google_play')
    or not exists(select 1 from public.monetization_products p where p.id=i.product_id
      and p.product_key=i.product_key and p.product_type='event_pass'
      and not p.is_physical_good and p.status not in('disabled','retired'))
    or not exists(select 1 from public.creator_money_supported_prices_internal('event',
      case i.provider when 'revenuecat_app_store' then 'ios' else 'android' end,i.environment) price
      where price->>'provider'=i.provider and price->>'providerProductId'=i.provider_product_id
        and price->>'productKey'=i.product_key and (price->>'amountMinor')::integer=i.amount_minor
        and price->>'currency'=i.currency)
  then raise exception 'event_checkout_price_unavailable'; end if;
  foreach switch_key in array array['digital_sales_enabled','creator_monetization_enabled',
    'provider_webhooks_enabled',case i.provider when 'revenuecat_app_store' then 'revenuecat_app_store_enabled'
      else 'revenuecat_google_play_enabled' end,'live_money_enabled']
  loop
    select state into switch_state from public.platform_money_kill_switches where key=switch_key;
    if (i.environment='production' and coalesce(switch_state,'off')<>'on')
      or (i.environment='sandbox' and case
        when switch_key='live_money_enabled' then coalesce(switch_state,'off')<>'off'
        when switch_key in('provider_webhooks_enabled','revenuecat_app_store_enabled','revenuecat_google_play_enabled')
          then coalesce(switch_state,'off')<>'sandbox_only'
        else coalesce(switch_state,'off') not in('on','sandbox_only') end)
      or i.environment not in('sandbox','production')
    then raise exception 'event_checkout_rail_unavailable'; end if;
  end loop;
  if i.environment='sandbox' and not public.resolve_sandbox_monetization_tester(i.user_id::text,null)
  then raise exception 'sandbox_monetization_tester_required'; end if;
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

-- Preserve the existing access resolver and historical rights. Only the new
-- purchase CTA is suppressed while the prior Store outcome remains unknown.
create or replace function public.resolve_paid_creator_event_pass_access(p_creator_event_id uuid)
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
  elsif r.id is not null or private.event_checkout_resolution_required(auth.uid(),p_creator_event_id)
  then reason:='event_reservation_pending';
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
