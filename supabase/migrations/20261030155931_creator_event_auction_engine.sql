-- Ordinary highest-bid, single virtual ticket auctions. No provider activation,
-- bidding fees, VIP/Stage seat rights, autocharges or automatic runner-up offers.
create table private.creator_event_auctions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.creator_events(id) on delete restrict,
  offer_id uuid not null references public.paid_creator_events(id) on delete restrict,
  revision_id uuid not null references public.creator_event_offer_revisions(id) on delete restrict,
  creator_id uuid not null,
  starting_amount_minor integer not null check(starting_amount_minor>0),
  min_increment_minor integer not null check(min_increment_minor>0),
  currency text not null check(currency ~ '^[a-z]{3}$'),
  environment text not null check(environment in('test','live')),
  closes_at timestamptz not null check(isfinite(closes_at)),
  payment_deadline timestamptz not null check(isfinite(payment_deadline)
    and payment_deadline>closes_at+interval '31 minutes' and payment_deadline<=closes_at+interval '24 hours'),
  state text not null default 'open' check(state in('open','awarded','payment_pending','fulfilled','expired','canceled','reconciliation_required')),
  highest_bid_id uuid,
  winner_id uuid,
  award_amount_minor integer check(award_amount_minor>0),
  created_at timestamptz not null default clock_timestamp(),
  check((winner_id is null)=(award_amount_minor is null))
);
create index creator_event_auctions_inventory on private.creator_event_auctions(event_id,state);
create table private.creator_event_auction_bids (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references private.creator_event_auctions(id) on delete restrict,
  buyer_id uuid not null,
  amount_minor integer not null check(amount_minor>0),
  request_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(buyer_id,request_id)
);
alter table private.creator_event_auctions add constraint creator_event_auction_highest_bid_fk
  foreign key(highest_bid_id) references private.creator_event_auction_bids(id) on delete restrict;
create table private.creator_event_auction_quotes (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references private.creator_event_auctions(id) on delete restrict,
  buyer_id uuid not null,creator_id uuid not null,session_id uuid not null,
  capability_id uuid not null,eligibility_id uuid not null,
  provider_account_id text not null,
  amount_minor integer not null check(amount_minor>0),currency text not null check(currency ~ '^[a-z]{3}$'),
  environment text not null check(environment in('test','live')),
  expires_at timestamptz not null check(isfinite(expires_at)),
  created_at timestamptz not null default clock_timestamp(),
  superseded_at timestamptz check(superseded_at is null or isfinite(superseded_at)),
  checkout_attempt_id uuid unique,checkout_started_at timestamptz,checkout_eligibility_id uuid,
  purchase_intent_id uuid unique references public.money_purchase_intents(id) on delete restrict,
  provider_checkout_session_id text unique,provider_payment_intent_id text unique,
  check((checkout_attempt_id is null)=(checkout_started_at is null)),
  check((checkout_attempt_id is null)=(checkout_eligibility_id is null)),
  check(superseded_at is null or (checkout_attempt_id is null and purchase_intent_id is null
    and provider_checkout_session_id is null and provider_payment_intent_id is null))
);
create unique index creator_event_auction_active_quote on private.creator_event_auction_quotes(auction_id)
  where superseded_at is null;
alter table private.creator_event_auctions enable row level security;
alter table private.creator_event_auctions force row level security;
alter table private.creator_event_auction_bids enable row level security;
alter table private.creator_event_auction_bids force row level security;
alter table private.creator_event_auction_quotes enable row level security;
alter table private.creator_event_auction_quotes force row level security;
revoke all on private.creator_event_auctions,private.creator_event_auction_bids,private.creator_event_auction_quotes from public,anon,authenticated,service_role;
-- Transaction-bound transfer proof, writable only inside reviewed definer code.
-- The prospective intent cannot yet have an FK: it is inserted in this same
-- transaction. This is never caller-supplied GUC or metadata authority.
create table private.creator_event_auction_transfers (
  quote_id uuid primary key references private.creator_event_auction_quotes(id) on delete restrict,
  intent_id uuid not null unique,transaction_id bigint not null
);
alter table private.creator_event_auction_transfers enable row level security;
alter table private.creator_event_auction_transfers force row level security;
revoke all on private.creator_event_auction_transfers from public,anon,authenticated,service_role;

create function private.guard_creator_event_auction_terms()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'auction_history_immutable'; end if;
  if row(new.event_id,new.offer_id,new.revision_id,new.creator_id,new.starting_amount_minor,new.min_increment_minor,
    new.currency,new.environment,new.closes_at,new.payment_deadline,new.created_at)
    is distinct from row(old.event_id,old.offer_id,old.revision_id,old.creator_id,old.starting_amount_minor,old.min_increment_minor,
    old.currency,old.environment,old.closes_at,old.payment_deadline,old.created_at)
  then raise exception 'auction_terms_immutable'; end if;
  return new;
end; $$;
create trigger creator_event_auction_terms_immutable before update or delete on private.creator_event_auctions
for each row execute function private.guard_creator_event_auction_terms();
create trigger creator_event_auction_bids_immutable before update or delete on private.creator_event_auction_bids
for each row execute function private.guard_event_ticket_terms_immutable();
revoke all on function private.guard_creator_event_auction_terms() from public,anon,authenticated,service_role;

create function private.guard_creator_event_auction_quote()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'auction_quote_immutable'; end if;
  if row(new.id,new.auction_id,new.buyer_id,new.creator_id,new.session_id,new.capability_id,new.eligibility_id,
    new.provider_account_id,new.amount_minor,new.currency,new.environment,new.expires_at,new.created_at)
    is distinct from row(old.id,old.auction_id,old.buyer_id,old.creator_id,old.session_id,old.capability_id,old.eligibility_id,
    old.provider_account_id,old.amount_minor,old.currency,old.environment,old.expires_at,old.created_at)
    or (old.checkout_attempt_id is not null and row(new.checkout_attempt_id,new.checkout_started_at,new.checkout_eligibility_id)
      is distinct from row(old.checkout_attempt_id,old.checkout_started_at,old.checkout_eligibility_id))
    or (old.purchase_intent_id is not null and new.purchase_intent_id is distinct from old.purchase_intent_id)
    or (old.provider_checkout_session_id is not null and new.provider_checkout_session_id is distinct from old.provider_checkout_session_id)
    or (old.provider_payment_intent_id is not null and new.provider_payment_intent_id is distinct from old.provider_payment_intent_id)
    or (old.superseded_at is not null and new is distinct from old)
    or (new.superseded_at is not null and (old.checkout_attempt_id is not null or old.purchase_intent_id is not null
      or old.provider_checkout_session_id is not null or old.provider_payment_intent_id is not null))
  then raise exception 'auction_quote_immutable'; end if;
  return new;
end; $$;
create trigger creator_event_auction_quote_immutable before update or delete on private.creator_event_auction_quotes
for each row execute function private.guard_creator_event_auction_quote();
revoke all on function private.guard_creator_event_auction_quote() from public,anon,authenticated,service_role;

-- Fixed-price admission, auction admission, and receipt fulfillment all lock
-- creator_events before checking this single shared capacity counter.
alter function public.event_ticket_inventory_internal(uuid) rename to event_ticket_inventory_pre_auctions_internal;
revoke all on function public.event_ticket_inventory_pre_auctions_internal(uuid) from public,anon,authenticated,service_role;
create function public.event_ticket_inventory_internal(p_creator_event_id uuid)
returns integer language sql volatile security definer set search_path='' as $$
  select public.event_ticket_inventory_pre_auctions_internal(p_creator_event_id)
    +(select count(*)::integer from private.creator_event_auctions a where a.event_id=p_creator_event_id
      and (a.state in('payment_pending','reconciliation_required')
        or (a.state in('open','awarded') and a.payment_deadline>clock_timestamp()
          and (a.closes_at>clock_timestamp() or a.highest_bid_id is not null)))
      and not exists(select 1 from private.creator_event_auction_quotes q
        join public.event_ticket_reservations r on r.purchase_intent_id=q.purchase_intent_id
        where q.auction_id=a.id and (r.state in('fulfilling','fulfilled') or (r.state='held' and r.expires_at>clock_timestamp())))
      and not exists(select 1 from private.creator_event_auction_transfers t
        join private.creator_event_auction_quotes q on q.id=t.quote_id
        where q.auction_id=a.id and t.transaction_id=txid_current()));
$$;
revoke all on function public.event_ticket_inventory_internal(uuid) from public,anon,authenticated,service_role;

create function private.creator_event_auction_source_valid(a private.creator_event_auctions)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.creator_events e
    join public.paid_creator_events o on o.creator_event_id=e.id
    join public.creator_event_offer_revisions r on r.id=a.revision_id and r.offer_id=o.id
    where e.id=a.event_id and o.id=a.offer_id and e.host_user_id=a.creator_id and o.creator_id=a.creator_id
      and not public.is_account_access_restricted(a.creator_id::text)
      and public.wave1_creator_money_subject_authorized_internal(a.creator_id)
      and e.status='scheduled' and coalesce(e.management_status,'published') not in('canceled','no_show','ended','sales_paused')
      and o.status=case a.environment when 'test' then 'sandbox' else 'active' end and not o.sales_paused
      and o.current_terms_revision_id=a.revision_id and e.starts_at>a.payment_deadline
      and r.terms->>'attendance'='virtual'
      and r.terms->>'replayPolicy' in('none','until_expiration')
      and (e.replay_policy='none' or (e.replay_available_at is not null and e.replay_expires_at is not null
        and isfinite(e.replay_available_at) and isfinite(e.replay_expires_at)
        and e.replay_available_at>=e.ends_at and e.replay_expires_at>e.replay_available_at))
      and row(e.starts_at,e.ends_at,e.time_zone,e.replay_policy,e.replay_available_at,e.replay_expires_at)
        is not distinct from row((r.terms->>'startsAt')::timestamptz,(r.terms->>'endsAt')::timestamptz,
          r.terms->>'timeZone',r.terms->>'replayPolicy',(r.terms->>'replayAvailableAt')::timestamptz,
          (r.terms->>'replayExpiresAt')::timestamptz));
$$;
revoke all on function private.creator_event_auction_source_valid(private.creator_event_auctions) from public,anon,authenticated,service_role;

create function private.assert_creator_event_auction_buyer(a private.creator_event_auctions,p_buyer_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_buyer_id is null or p_buyer_id=a.creator_id then raise exception 'auction_owner_cannot_bid'; end if;
  if public.is_account_access_restricted(p_buyer_id::text) or not public.can_read_creator_event(a.event_id,p_buyer_id)
    or exists(select 1 from public.channel_audience_blocks b
      where (b.channel_user_id=a.creator_id::text and b.blocked_user_id=p_buyer_id::text)
        or (b.channel_user_id=p_buyer_id::text and b.blocked_user_id=a.creator_id::text))
  then raise exception 'auction_buyer_unavailable'; end if;
  if exists(select 1 from public.paid_creator_event_passes p where p.creator_event_id=a.event_id and p.buyer_id=p_buyer_id
    and p.status='active' and p.refunded_at is null and p.revoked_at is null and (p.expires_at is null or p.expires_at>clock_timestamp()))
    or exists(select 1 from public.event_ticket_reservations r where r.creator_event_id=a.event_id and r.buyer_id=p_buyer_id
      and (r.state in('fulfilling','reconciliation_required') or (r.state='held' and r.expires_at>clock_timestamp())))
    or private.event_checkout_resolution_required(p_buyer_id,a.event_id)
    or exists(select 1 from private.creator_event_auctions other where other.event_id=a.event_id and other.id<>a.id
      and other.winner_id=p_buyer_id and other.state in('awarded','payment_pending','reconciliation_required'))
  then raise exception 'auction_existing_ticket_or_payment'; end if;
end; $$;
revoke all on function private.assert_creator_event_auction_buyer(private.creator_event_auctions,uuid) from public,anon,authenticated,service_role;

-- Caller must already hold the event row then auction row, in that order.
create function private.advance_creator_event_auction(p_auction_id uuid)
returns private.creator_event_auctions language plpgsql security definer set search_path='' as $$
declare a private.creator_event_auctions; b private.creator_event_auction_bids;
begin
  select * into a from private.creator_event_auctions where id=p_auction_id for update;
  if a.state in('open','awarded') then
    if not private.creator_event_auction_source_valid(a) then
      update private.creator_event_auctions set state='canceled' where id=a.id returning * into a;
    elsif a.state='open' and a.closes_at<=clock_timestamp() then
      select * into b from private.creator_event_auction_bids where id=a.highest_bid_id and auction_id=a.id;
      update private.creator_event_auctions set state=case when b.id is null or a.payment_deadline<=clock_timestamp() then 'expired' else 'awarded' end,
        winner_id=b.buyer_id,award_amount_minor=b.amount_minor where id=a.id returning * into a;
    elsif a.payment_deadline<=clock_timestamp() then
      update private.creator_event_auctions set state='expired' where id=a.id returning * into a;
    end if;
  end if;
  return a;
end; $$;
revoke all on function private.advance_creator_event_auction(uuid) from public,anon,authenticated,service_role;

create function private.creator_event_auction_safe_row(a private.creator_event_auctions)
returns jsonb language sql volatile security definer set search_path='' as $$
  select jsonb_build_object('id',a.id,'creatorEventId',a.event_id,'offerId',a.offer_id,'termsRevisionId',a.revision_id,
    'terms',(select terms-'priceCents'-'salesOpenAt'-'salesCloseAt' from public.creator_event_offer_revisions where id=a.revision_id),'creatorId',a.creator_id,
    'startingAmountMinor',a.starting_amount_minor,'minIncrementMinor',a.min_increment_minor,
    'closesAt',a.closes_at,'paymentDeadline',a.payment_deadline,'latestCheckoutStartAt',a.payment_deadline-interval '31 minutes',
    'currency',a.currency,'environment',a.environment,
    'state',a.state,'highestAmountMinor',b.amount_minor,
    'nextBidAmountMinor',case when b.id is null then a.starting_amount_minor::bigint else b.amount_minor::bigint+a.min_increment_minor end,
    'isHighestBidder',coalesce(b.buyer_id=auth.uid(),false),'isWinner',coalesce(a.winner_id=auth.uid(),false),
    'awardAmountMinor',a.award_amount_minor,'myBidAmountMinor',(select max(amount_minor) from private.creator_event_auction_bids
      where auction_id=a.id and buyer_id=auth.uid()),'serverNow',clock_timestamp())
  from (select 1) seed left join private.creator_event_auction_bids b on b.id=a.highest_bid_id;
$$;
revoke all on function private.creator_event_auction_safe_row(private.creator_event_auctions) from public,anon,authenticated,service_role;

create function public.create_creator_event_auction(p_creator_event_id uuid,p_expected_revision_id uuid,
  p_starting_amount_minor integer,p_min_increment_minor integer,p_closes_at timestamptz,
  p_payment_deadline timestamptz,p_environment text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.creator_events; o public.paid_creator_events; a private.creator_event_auctions;
begin
  perform public.wave1_assert_current_creator_money_authority_internal();
  select * into e from public.creator_events where id=p_creator_event_id for update;
  perform public.wave1_assert_current_creator_money_authority_internal();
  if e.id is null or e.host_user_id is distinct from auth.uid() then raise exception 'event_creator_required'; end if;
  select * into o from public.paid_creator_events where creator_event_id=e.id
    and current_terms_revision_id=p_expected_revision_id for update;
  if o.id is null then raise exception 'auction_event_revision_required'; end if;
  if p_starting_amount_minor is null or p_starting_amount_minor<=0 or p_min_increment_minor is null or p_min_increment_minor<=0
    or p_starting_amount_minor::bigint+p_min_increment_minor>2147483647
    or p_environment is null or p_environment not in('test','live')
    or p_closes_at is null or not isfinite(p_closes_at) or p_closes_at<=clock_timestamp()
    or p_payment_deadline is null or not isfinite(p_payment_deadline) or p_payment_deadline<=p_closes_at+interval '31 minutes'
    or p_payment_deadline>p_closes_at+interval '24 hours'
    or p_payment_deadline>=e.starts_at
  then raise exception 'auction_terms_invalid'; end if;
  a.event_id:=e.id;a.offer_id:=o.id;a.revision_id:=p_expected_revision_id;a.creator_id:=auth.uid();
  a.environment:=p_environment;a.payment_deadline:=p_payment_deadline;
  if not private.creator_event_auction_source_valid(a) then raise exception 'auction_source_unavailable'; end if;
  -- One concurrent lot per event also makes a repeated creator submit safe.
  select * into a from private.creator_event_auctions where event_id=e.id
    and state in('open','awarded','payment_pending','reconciliation_required') order by created_at,id limit 1;
  if a.id is not null then
    a:=private.advance_creator_event_auction(a.id);
    if a.state in('open','awarded','payment_pending','reconciliation_required') then
      if row(a.revision_id,a.starting_amount_minor,a.min_increment_minor,a.closes_at,a.payment_deadline,a.environment)
        is not distinct from row(p_expected_revision_id,p_starting_amount_minor,p_min_increment_minor,p_closes_at,p_payment_deadline,p_environment)
      then return private.creator_event_auction_safe_row(a); end if;
      raise exception 'auction_existing_lot_unresolved';
    end if;
  end if;
  if o.capacity_limit is not null and public.event_ticket_inventory_internal(e.id)>=o.capacity_limit
  then raise exception 'event_sold_out'; end if;
  insert into private.creator_event_auctions(event_id,offer_id,revision_id,creator_id,starting_amount_minor,min_increment_minor,
    currency,environment,closes_at,payment_deadline) values(e.id,o.id,p_expected_revision_id,auth.uid(),p_starting_amount_minor,
    p_min_increment_minor,o.currency,p_environment,p_closes_at,p_payment_deadline) returning * into a;
  return private.creator_event_auction_safe_row(a);
end; $$;
revoke all on function public.create_creator_event_auction(uuid,uuid,integer,integer,timestamptz,timestamptz,text) from public,anon,authenticated,service_role;
grant execute on function public.create_creator_event_auction(uuid,uuid,integer,integer,timestamptz,timestamptz,text) to authenticated;

create function public.read_creator_event_auction(p_auction_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.creator_event_auctions;
begin
  if auth.uid() is null or not public.wave1_current_caller_authority_internal() or public.is_account_access_restricted(auth.uid()::text)
  then raise exception 'buyer_session_authority_required'; end if;
  select * into a from private.creator_event_auctions where id=p_auction_id;
  if a.id is null or not public.can_read_creator_event(a.event_id,auth.uid()) then raise exception 'auction_not_found'; end if;
  perform 1 from public.creator_events where id=a.event_id for update;
  if not public.wave1_current_caller_authority_internal() or public.is_account_access_restricted(auth.uid()::text)
  then raise exception 'buyer_session_authority_required'; end if;
  a:=private.advance_creator_event_auction(a.id);
  return private.creator_event_auction_safe_row(a);
end; $$;
revoke all on function public.read_creator_event_auction(uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_creator_event_auction(uuid) to authenticated;
create function public.close_creator_event_auction(p_auction_id uuid)
returns jsonb language sql volatile security definer set search_path='' as $$ select public.read_creator_event_auction(p_auction_id); $$;
revoke all on function public.close_creator_event_auction(uuid) from public,anon,authenticated,service_role;
grant execute on function public.close_creator_event_auction(uuid) to authenticated;
create function public.list_creator_event_auctions(p_creator_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb:='[]'::jsonb; a record;
begin
  if auth.uid() is null or not public.wave1_current_caller_authority_internal() or public.is_account_access_restricted(auth.uid()::text)
    or not public.can_read_creator_event(p_creator_event_id,auth.uid()) then raise exception 'auction_not_found'; end if;
  for a in select id from private.creator_event_auctions where event_id=p_creator_event_id order by created_at desc,id limit 50
  loop result:=result||jsonb_build_array(public.read_creator_event_auction(a.id)); end loop;
  return result;
end; $$;
revoke all on function public.list_creator_event_auctions(uuid) from public,anon,authenticated,service_role;
grant execute on function public.list_creator_event_auctions(uuid) to authenticated;

create function public.place_creator_event_auction_bid(p_auction_id uuid,p_amount_minor integer,p_request_id uuid,p_capability_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.creator_event_auctions;b private.creator_event_auction_bids; prior private.creator_event_auction_bids;
begin
  if auth.uid() is null or not public.wave1_current_caller_authority_internal() or public.is_account_access_restricted(auth.uid()::text)
  then raise exception 'buyer_session_authority_required'; end if;
  if p_request_id is null then raise exception 'auction_bid_identity_required'; end if;
  select * into a from private.creator_event_auctions where id=p_auction_id;
  if a.id is null then raise exception 'auction_not_found'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'creator-money-source-intent:'||auth.uid()::text||':event:'||a.event_id::text,0));
  perform 1 from public.creator_events where id=a.event_id for update;
  if not public.wave1_current_caller_authority_internal() or public.is_account_access_restricted(auth.uid()::text)
  then raise exception 'buyer_session_authority_required'; end if;
  a:=private.advance_creator_event_auction(a.id);
  perform private.assert_creator_event_auction_buyer(a,auth.uid());
  select * into prior from private.creator_event_auction_bids where buyer_id=auth.uid() and request_id=p_request_id;
  if prior.id is not null then
    if prior.auction_id<>a.id or prior.amount_minor is distinct from p_amount_minor then raise exception 'auction_bid_replay_mismatch'; end if;
    return private.creator_event_auction_safe_row(a);
  end if;
  if a.state<>'open' or a.closes_at<=clock_timestamp() then raise exception 'auction_bidding_closed'; end if;
  select * into b from private.creator_event_auction_bids where id=a.highest_bid_id;
  if p_amount_minor is null or p_amount_minor<a.starting_amount_minor
    or (b.id is not null and p_amount_minor::bigint<b.amount_minor::bigint+a.min_increment_minor)
  then raise exception 'auction_bid_below_minimum'; end if;
  perform private.resolve_creator_external_payment_capability(auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid,
    'event_auction',a.creator_id,p_amount_minor,a.currency,a.environment,p_capability_id);
  -- Capability evidence can itself wait on an issuer update. Never accept a
  -- bid whose final authorization arrived after the advertised hard close.
  if a.closes_at<=clock_timestamp() then raise exception 'auction_bidding_closed'; end if;
  insert into private.creator_event_auction_bids(auction_id,buyer_id,amount_minor,request_id)
    values(a.id,auth.uid(),p_amount_minor,p_request_id) returning * into b;
  update private.creator_event_auctions set highest_bid_id=b.id where id=a.id returning * into a;
  return private.creator_event_auction_safe_row(a);
end; $$;
revoke all on function public.place_creator_event_auction_bid(uuid,integer,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.place_creator_event_auction_bid(uuid,integer,uuid,uuid) to authenticated;

create function public.read_creator_event_auction_bid_eligibility(p_auction_id uuid,p_amount_minor integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.creator_event_auctions;
begin
  if auth.uid() is null or not public.wave1_current_caller_authority_internal() or public.is_account_access_restricted(auth.uid()::text)
  then raise exception 'buyer_session_authority_required'; end if;
  select * into a from private.creator_event_auctions where id=p_auction_id;
  if a.id is null or not public.can_read_creator_event(a.event_id,auth.uid()) then raise exception 'auction_not_found'; end if;
  perform private.assert_creator_event_auction_buyer(a,auth.uid());
  if a.state not in('open','awarded') or not private.creator_event_auction_source_valid(a)
    or (a.state='open' and a.closes_at<=clock_timestamp()) or a.payment_deadline<=clock_timestamp()
    or (a.state='awarded' and (a.winner_id is distinct from auth.uid() or a.payment_deadline<clock_timestamp()+interval '31 minutes'))
  then return jsonb_build_object('available',false,'unavailableReason','auction_unavailable'); end if;
  perform private.resolve_creator_external_payment_capability(auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid,
    'event_auction',a.creator_id,p_amount_minor,a.currency,a.environment,null);
  return jsonb_build_object('available',true,'unavailableReason',null);
exception when raise_exception then
  if sqlerrm in('external_payment_capability_unavailable','auction_owner_cannot_bid','auction_buyer_unavailable','auction_existing_ticket_or_payment')
  then return jsonb_build_object('available',false,'unavailableReason',sqlerrm); end if;
  raise;
end; $$;
revoke all on function public.read_creator_event_auction_bid_eligibility(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.read_creator_event_auction_bid_eligibility(uuid,integer) to authenticated;

create function private.creator_event_auction_quote_safe_row(q private.creator_event_auction_quotes)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',q.id,'auctionId',q.auction_id,'amountMinor',q.amount_minor,'currency',q.currency,
   'environment',q.environment,'expiresAt',q.expires_at,'state',a.state,
   'checkoutStarted',q.checkout_started_at is not null) from private.creator_event_auctions a where a.id=q.auction_id;
$$;
revoke all on function private.creator_event_auction_quote_safe_row(private.creator_event_auction_quotes) from public,anon,authenticated,service_role;
create function public.create_creator_event_auction_award_quote(p_auction_id uuid,p_capability_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.creator_event_auctions;q private.creator_event_auction_quotes;c jsonb;s uuid;
begin
  if auth.uid() is null or not public.wave1_current_caller_authority_internal() or public.is_account_access_restricted(auth.uid()::text)
  then raise exception 'buyer_session_authority_required'; end if;
  s:=nullif(auth.jwt()->>'session_id','')::uuid;
  select * into a from private.creator_event_auctions where id=p_auction_id;
  if a.id is null then raise exception 'auction_not_found'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'creator-money-source-intent:'||auth.uid()::text||':event:'||a.event_id::text,0));
  perform 1 from public.creator_events where id=a.event_id for update;
  if not public.wave1_current_caller_authority_internal() or public.is_account_access_restricted(auth.uid()::text)
  then raise exception 'buyer_session_authority_required'; end if;
  a:=private.advance_creator_event_auction(a.id);
  if a.winner_id is distinct from auth.uid() then raise exception 'auction_winner_required'; end if;
  select * into q from private.creator_event_auction_quotes where auction_id=a.id and superseded_at is null for update;
  if q.id is not null then
    if q.session_id=s then return private.creator_event_auction_quote_safe_row(q); end if;
    if a.state<>'awarded' or q.checkout_attempt_id is not null or q.checkout_started_at is not null
      or q.purchase_intent_id is not null or q.provider_checkout_session_id is not null or q.provider_payment_intent_id is not null
      or exists(select 1 from private.creator_event_auction_transfers t where t.quote_id=q.id)
    then raise exception 'auction_quote_session_changed'; end if;
  end if;
  if a.state<>'awarded' or a.payment_deadline<clock_timestamp()+interval '31 minutes' then raise exception 'auction_award_unavailable'; end if;
  perform private.assert_creator_event_auction_buyer(a,auth.uid());
  c:=private.resolve_creator_external_payment_capability(auth.uid(),s,'event_auction',a.creator_id,a.award_amount_minor,
    a.currency,a.environment,p_capability_id);
  if q.id is not null then
    -- The obsolete quote can never be dispatched, including by the old login.
    -- Preserve its identity/evidence instead of mutating it to another session.
    update private.creator_event_auction_quotes set superseded_at=clock_timestamp() where id=q.id;
  end if;
  insert into private.creator_event_auction_quotes(auction_id,buyer_id,creator_id,session_id,capability_id,eligibility_id,
    provider_account_id,amount_minor,currency,environment,expires_at)
  values(a.id,auth.uid(),a.creator_id,s,(c->>'capabilityId')::uuid,(c->>'eligibilityId')::uuid,c->>'providerAccountId',
    a.award_amount_minor,a.currency,a.environment,a.payment_deadline) returning * into q;
  return private.creator_event_auction_quote_safe_row(q);
end; $$;
revoke all on function public.create_creator_event_auction_award_quote(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.create_creator_event_auction_award_quote(uuid,uuid) to authenticated;

create function public.claim_creator_event_auction_checkout(p_quote_id uuid,p_buyer_id uuid,p_session_id uuid,p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.creator_event_auctions;q private.creator_event_auction_quotes;c jsonb; authorized boolean:=false;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
  if p_attempt_id is null or p_session_id is null then raise exception 'auction_checkout_identity_required'; end if;
  select * into q from private.creator_event_auction_quotes where id=p_quote_id;
  if q.id is null or q.superseded_at is not null or q.buyer_id is distinct from p_buyer_id or q.session_id is distinct from p_session_id
  then raise exception 'auction_quote_not_found'; end if;
  select * into a from private.creator_event_auctions where id=q.auction_id;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'creator-money-source-intent:'||p_buyer_id::text||':event:'||a.event_id::text,0));
  perform 1 from public.creator_events where id=a.event_id for update;
  a:=private.advance_creator_event_auction(a.id);
  select * into q from private.creator_event_auction_quotes where id=p_quote_id for update;
  if q.superseded_at is not null then raise exception 'auction_quote_superseded'; end if;
  if not public.money_purchase_intent_session_authorized_internal(p_buyer_id,p_session_id::text)
    or public.is_account_access_restricted(p_buyer_id::text) then raise exception 'buyer_session_authority_required'; end if;
  if q.checkout_attempt_id is null then
    if a.state<>'awarded' or a.winner_id is distinct from p_buyer_id or q.expires_at<clock_timestamp()+interval '31 minutes'
      or not private.creator_event_auction_source_valid(a) then raise exception 'auction_award_unavailable'; end if;
    perform private.assert_creator_event_auction_buyer(a,p_buyer_id);
    c:=private.resolve_creator_external_payment_capability(p_buyer_id,p_session_id,'event_auction',a.creator_id,
      q.amount_minor,q.currency,q.environment,q.capability_id);
    if c->>'providerAccountId' is distinct from q.provider_account_id
    then raise exception 'external_payment_capability_unavailable'; end if;
    if q.expires_at<clock_timestamp()+interval '31 minutes' then raise exception 'auction_award_unavailable'; end if;
    update private.creator_event_auction_quotes set checkout_attempt_id=p_attempt_id,checkout_started_at=clock_timestamp(),
      checkout_eligibility_id=(c->>'eligibilityId')::uuid
      where id=q.id returning * into q;
    update private.creator_event_auctions set state='payment_pending' where id=a.id returning * into a;
    authorized:=true;
  end if;
  return jsonb_build_object('startAuthorized',authorized,'quoteId',q.id,'auctionId',a.id,'creatorEventId',a.event_id,
    'offerId',a.offer_id,'termsRevisionId',a.revision_id,'buyerId',q.buyer_id,'creatorId',q.creator_id,
    'amountMinor',q.amount_minor,'currency',q.currency,'providerAccountId',q.provider_account_id,'environment',q.environment,
    'expiresAt',q.expires_at,'checkoutAttemptId',q.checkout_attempt_id,'providerCheckoutSessionId',q.provider_checkout_session_id,
    'capabilityId',q.capability_id,'eligibilityId',q.eligibility_id,
    'routeKind',c->>'routeKind','platform',c->>'platform','storefrontCountry',c->>'storefrontCountry');
end; $$;
revoke all on function public.claim_creator_event_auction_checkout(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.claim_creator_event_auction_checkout(uuid,uuid,uuid,uuid) to service_role;

-- Keep the native-store trigger body unchanged and route only a dedicated
-- award-backed provider through this exact transfer boundary.
drop trigger bind_event_ticket_purchase_terms on public.money_purchase_intents;
create trigger bind_event_ticket_purchase_terms before insert or update of event_terms_revision_id on public.money_purchase_intents
for each row when (new.provider<>'stripe_event_auction') execute function private.bind_event_ticket_purchase_terms();
create function private.bind_auction_event_ticket_purchase_terms()
returns trigger language plpgsql security definer set search_path='' as $$
declare q private.creator_event_auction_quotes;a private.creator_event_auctions;t private.creator_event_auction_transfers;
  o public.paid_creator_events;
begin
  if tg_op='UPDATE' then
    if new.event_terms_revision_id is distinct from old.event_terms_revision_id then raise exception 'event_ticket_terms_immutable'; end if;
    return new;
  end if;
  select * into t from private.creator_event_auction_transfers where intent_id=new.id and transaction_id=txid_current();
  select * into q from private.creator_event_auction_quotes where id=t.quote_id;
  select * into a from private.creator_event_auctions where id=q.auction_id;
  if t.quote_id is null or q.id is null or a.id is null then raise exception 'auction_transfer_authority_required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'creator-money-source-intent:'||new.user_id::text||':event:'||new.source_id::text,0));
  perform 1 from public.creator_events where id=a.event_id for update;
  select * into a from private.creator_event_auctions where id=a.id for update;
  select * into o from public.paid_creator_events where id=a.offer_id for update;
  if new.product_type<>'event_pass' or new.source_type<>'event' or new.source_id is distinct from a.event_id
    or new.user_id is distinct from q.buyer_id or a.winner_id is distinct from q.buyer_id
    or new.creator_id is distinct from a.creator_id or q.creator_id is distinct from a.creator_id
    or new.session_generation is distinct from q.session_id::text
    or new.amount_minor is distinct from q.amount_minor or new.amount_minor is distinct from a.award_amount_minor
    or new.currency is distinct from q.currency or q.currency is distinct from a.currency
    or new.environment is distinct from (case q.environment when 'test' then 'sandbox' else 'production' end)
    or a.state<>'payment_pending' or q.superseded_at is not null or q.checkout_attempt_id is null or q.purchase_intent_id is not null
    or new.event_terms_revision_id is distinct from a.revision_id
    or not private.creator_event_auction_source_valid(a)
    or q.expires_at<=clock_timestamp() or new.expires_at is distinct from q.expires_at
  then raise exception 'auction_transfer_identity_invalid'; end if;
  if o.capacity_limit is not null and public.event_ticket_inventory_internal(a.event_id)>=o.capacity_limit
  then raise exception 'event_sold_out'; end if;
  return new;
end; $$;
revoke all on function private.bind_auction_event_ticket_purchase_terms() from public,anon,authenticated,service_role;
create trigger bind_auction_event_ticket_purchase_terms before insert or update of event_terms_revision_id on public.money_purchase_intents
for each row when (new.provider='stripe_event_auction') execute function private.bind_auction_event_ticket_purchase_terms();

drop trigger reserve_event_ticket_after_intent on public.money_purchase_intents;
create trigger reserve_event_ticket_after_intent after insert on public.money_purchase_intents
for each row when (new.provider<>'stripe_event_auction') execute function private.reserve_event_ticket_after_intent();
create function private.reserve_auction_event_ticket_after_intent()
returns trigger language plpgsql security definer set search_path='' as $$
declare q private.creator_event_auction_quotes;a private.creator_event_auctions;
begin
  select quote.* into q from private.creator_event_auction_quotes quote
    join private.creator_event_auction_transfers t on t.quote_id=quote.id
    where t.intent_id=new.id and t.transaction_id=txid_current();
  select * into a from private.creator_event_auctions where id=q.auction_id;
  if q.id is null or a.id is null then raise exception 'auction_transfer_authority_required'; end if;
  insert into public.event_ticket_reservations(purchase_intent_id,revision_id,buyer_id,creator_event_id,offer_id,expires_at,
    checkout_attempt_id,checkout_started_at)
  values(new.id,a.revision_id,q.buyer_id,a.event_id,a.offer_id,q.expires_at,q.checkout_attempt_id,q.checkout_started_at);
  update private.creator_event_auction_quotes set purchase_intent_id=new.id where id=q.id;
  delete from private.creator_event_auction_transfers where quote_id=q.id and transaction_id=txid_current();
  return new;
end; $$;
revoke all on function private.reserve_auction_event_ticket_after_intent() from public,anon,authenticated,service_role;
create trigger reserve_auction_event_ticket_after_intent after insert on public.money_purchase_intents
for each row when (new.provider='stripe_event_auction') execute function private.reserve_auction_event_ticket_after_intent();
