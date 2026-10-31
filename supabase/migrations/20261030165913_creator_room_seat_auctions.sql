-- Typed single-lot room-session auctions. No VIP, bidding fees, autocharges,
-- automatic media publication, provider activation or automatic refunds.
alter table private.creator_external_payment_capabilities drop constraint creator_external_payment_capabilities_feature_check;
alter table private.creator_external_payment_capabilities add constraint creator_external_payment_capabilities_feature_check
 check(feature in('creator_tip','event_auction','room_seat_auction'));
create table private.creator_room_seat_auctions (
  id uuid primary key default gen_random_uuid(),
  party_id text not null,
  room_session_id uuid not null references private.creator_room_sessions(id),
  claim_id uuid not null unique references private.creator_room_seat_claims(id),
  source_kind text not null check(source_kind in('stage_reserved_seat','party_admission')),
  creator_id uuid not null,
  request_id uuid not null,
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
  check((winner_id is null)=(award_amount_minor is null)),
  unique(creator_id,request_id)
);
create index creator_room_seat_auctions_inventory on private.creator_room_seat_auctions(party_id,state);
create table private.creator_room_seat_auction_bids (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references private.creator_room_seat_auctions(id) on delete restrict,
  buyer_id uuid not null,
  amount_minor integer not null check(amount_minor>0),
  request_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(buyer_id,request_id)
);
alter table private.creator_room_seat_auctions add constraint creator_room_seat_auction_highest_bid_fk
  foreign key(highest_bid_id) references private.creator_room_seat_auction_bids(id) on delete restrict;
create table private.creator_room_auction_quotes (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references private.creator_room_seat_auctions(id) on delete restrict,
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
create unique index creator_room_seat_auction_active_quote on private.creator_room_auction_quotes(auction_id)
  where superseded_at is null;
alter table private.creator_room_seat_auctions enable row level security;
alter table private.creator_room_seat_auctions force row level security;
alter table private.creator_room_seat_auction_bids enable row level security;
alter table private.creator_room_seat_auction_bids force row level security;
alter table private.creator_room_auction_quotes enable row level security;
alter table private.creator_room_auction_quotes force row level security;
revoke all on private.creator_room_seat_auctions,private.creator_room_seat_auction_bids,private.creator_room_auction_quotes from public,anon,authenticated,service_role;
create function private.guard_creator_room_seat_auction_terms()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'auction_history_immutable'; end if;
  if row(new.party_id,new.room_session_id,new.claim_id,new.source_kind,new.creator_id,new.request_id,new.starting_amount_minor,new.min_increment_minor,
    new.currency,new.environment,new.closes_at,new.payment_deadline,new.created_at)
    is distinct from row(old.party_id,old.room_session_id,old.claim_id,old.source_kind,old.creator_id,old.request_id,old.starting_amount_minor,old.min_increment_minor,
    old.currency,old.environment,old.closes_at,old.payment_deadline,old.created_at)
  then raise exception 'auction_terms_immutable'; end if;
  return new;
end; $$;
create trigger creator_room_seat_auction_terms_immutable before update or delete on private.creator_room_seat_auctions
for each row execute function private.guard_creator_room_seat_auction_terms();
create trigger creator_room_seat_auction_bids_immutable before update or delete on private.creator_room_seat_auction_bids
for each row execute function private.guard_event_ticket_terms_immutable();
revoke all on function private.guard_creator_room_seat_auction_terms() from public,anon,authenticated,service_role;

create function private.guard_creator_room_seat_auction_quote()
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
create trigger creator_room_seat_auction_quote_immutable before update or delete on private.creator_room_auction_quotes
for each row execute function private.guard_creator_room_seat_auction_quote();
revoke all on function private.guard_creator_room_seat_auction_quote() from public,anon,authenticated,service_role;

-- Party native checkout locks offer first; all auction mutation paths use the
-- same order, then the canonical room, auction and immutable quote.
create function private.lock_creator_room_inventory(p_party_id text)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.paid_watch_party_offers where party_id=p_party_id for update;
 perform 1 from public.watch_party_rooms where party_id=p_party_id for update;
end; $$;
revoke all on function private.lock_creator_room_inventory(text) from public,anon,authenticated,service_role;
create function private.creator_room_seat_auction_source_valid(a private.creator_room_seat_auctions)
returns boolean language sql stable security definer set search_path='' as $$
 select private.creator_room_session_current(a.room_session_id)
   and private.creator_room_seat_subject_allowed(a.party_id,a.creator_id)
   and exists(select 1 from public.watch_party_rooms r where r.party_id=a.party_id and r.host_user_id=a.creator_id
     and ((a.source_kind='stage_reserved_seat' and r.room_type='live') or
       (a.source_kind='party_admission' and r.room_type='title' and private.party_room_content_metadata(r) is not null
         and not exists(select 1 from public.videos v where v.id=private.discovery_notification_uuid(r.source_id)
           and r.source_type='creator_video' and coalesce(v.vip_access_required,false)) and exists(select 1 from public.paid_watch_party_offers o
         where o.party_id=r.party_id and o.creator_id=a.creator_id and o.seat_limit is not null
           and o.status=case a.environment when 'test' then 'sandbox' else 'active' end))));
$$;
revoke all on function private.creator_room_seat_auction_source_valid(private.creator_room_seat_auctions) from public,anon,authenticated,service_role;
create function private.assert_creator_room_seat_auction_buyer(a private.creator_room_seat_auctions,p_buyer_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_buyer_id is null or p_buyer_id=a.creator_id then raise exception 'auction_owner_cannot_bid'; end if;
 if not private.creator_room_seat_subject_allowed(a.party_id,p_buyer_id) then raise exception 'auction_buyer_unavailable'; end if;
 if exists(select 1 from private.creator_room_seat_claims c where c.room_session_id=a.room_session_id and c.id<>a.claim_id
   and c.buyer_id=p_buyer_id and c.state in('winner_hold','payment_pending','paid_reserved','available','unfulfilled'))
   or (a.source_kind='party_admission' and (
     exists(select 1 from public.paid_watch_party_tickets t where t.party_id=a.party_id and t.buyer_id=p_buyer_id
       and t.status='active' and t.refunded_at is null and t.revoked_at is null and (t.expires_at is null or t.expires_at>clock_timestamp()))
     or exists(select 1 from private.creator_party_ticket_reservations n where n.party_id=a.party_id and n.buyer_id=p_buyer_id
       and (n.state in('pending','reconciliation_required') or (n.state='held' and n.expires_at>clock_timestamp())))))
 then raise exception 'auction_existing_ticket_or_payment'; end if;
end; $$;
revoke all on function private.assert_creator_room_seat_auction_buyer(private.creator_room_seat_auctions,uuid) from public,anon,authenticated,service_role;
-- Caller must already hold the event row then auction row, in that order.
create function private.advance_creator_room_seat_auction(p_auction_id uuid)
returns private.creator_room_seat_auctions language plpgsql security definer set search_path='' as $$
declare a private.creator_room_seat_auctions; b private.creator_room_seat_auction_bids;
begin
  select * into a from private.creator_room_seat_auctions where id=p_auction_id for update;
  if a.state in('open','awarded') then
    if not private.creator_room_seat_auction_source_valid(a) then
      update private.creator_room_seat_auctions set state='canceled' where id=a.id returning * into a;
    elsif a.state='open' and a.closes_at<=clock_timestamp() then
      select * into b from private.creator_room_seat_auction_bids where id=a.highest_bid_id and auction_id=a.id;
      update private.creator_room_seat_auctions set state=case when b.id is null or a.payment_deadline<=clock_timestamp() then 'expired' else 'awarded' end,
        winner_id=b.buyer_id,award_amount_minor=b.amount_minor where id=a.id returning * into a;
    elsif a.payment_deadline<=clock_timestamp() then
      update private.creator_room_seat_auctions set state='expired' where id=a.id returning * into a;
    end if;
  end if;
  update private.creator_room_seat_claims set
    state=case when a.state='awarded' then 'winner_hold' when a.state in('expired','canceled') then 'released' else state end,
    buyer_id=coalesce(buyer_id,a.winner_id),updated_at=clock_timestamp()
    where id=a.claim_id and state in('auction_hold','winner_hold');
  return a;
end; $$;
revoke all on function private.advance_creator_room_seat_auction(uuid) from public,anon,authenticated,service_role;

create function private.creator_room_seat_auction_safe_row(a private.creator_room_seat_auctions)
returns jsonb language sql volatile security definer set search_path='' as $$
  select jsonb_build_object('id',a.id,'requestId',a.request_id,'partyId',a.party_id,'roomSessionId',a.room_session_id,
    'claimId',a.claim_id,'sourceKind',a.source_kind,'creatorId',a.creator_id,
    'terms',jsonb_build_object('roomSessionId',a.room_session_id,'sourceKind',a.source_kind,
      'admissionIncluded',true,'sameAccountRejoin',true,'hostControlsMediaAndModeration',true,
      'endsWhenCreatorEndsRoom',true,'nonDelivery','reconciliation_provider_refund_review','automaticRefund',false),
    'startingAmountMinor',a.starting_amount_minor,'minIncrementMinor',a.min_increment_minor,
    'closesAt',a.closes_at,'paymentDeadline',a.payment_deadline,'latestCheckoutStartAt',a.payment_deadline-interval '31 minutes',
    'currency',a.currency,'environment',a.environment,
    'state',a.state,'highestAmountMinor',b.amount_minor,
    'nextBidAmountMinor',case when b.id is null then a.starting_amount_minor::bigint else b.amount_minor::bigint+a.min_increment_minor end,
    'isHighestBidder',coalesce(b.buyer_id=auth.uid(),false),'isWinner',coalesce(a.winner_id=auth.uid(),false),
    'awardAmountMinor',a.award_amount_minor,'myBidAmountMinor',(select max(amount_minor) from private.creator_room_seat_auction_bids
      where auction_id=a.id and buyer_id=auth.uid()),'serverNow',clock_timestamp())
  from (select 1) seed left join private.creator_room_seat_auction_bids b on b.id=a.highest_bid_id;
$$;
revoke all on function private.creator_room_seat_auction_safe_row(private.creator_room_seat_auctions) from public,anon,authenticated,service_role;

create function public.prepare_creator_room_seat_auction(p_party_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.watch_party_rooms;s private.creator_room_sessions;
begin
 perform public.wave1_assert_current_creator_money_authority_internal();
 perform private.lock_creator_room_inventory(p_party_id);
 perform public.wave1_assert_current_creator_money_authority_internal();
 select * into r from public.watch_party_rooms where party_id=p_party_id;
 if r.party_id is null or r.host_user_id is distinct from auth.uid() then raise exception 'room_creator_required'; end if;
 s:=private.ensure_creator_room_session(p_party_id);
 return jsonb_build_object('partyId',r.party_id,'roomSessionId',s.id,
   'sourceKind',case r.room_type when 'live' then 'stage_reserved_seat' else 'party_admission' end,'serverNow',clock_timestamp());
end; $$;
revoke all on function public.prepare_creator_room_seat_auction(text) from public,anon,authenticated,service_role;
grant execute on function public.prepare_creator_room_seat_auction(text) to authenticated;

create function public.create_creator_room_seat_auction(p_party_id text,p_source_kind text,
 p_starting_amount_minor integer,p_min_increment_minor integer,p_closes_at timestamptz,
 p_payment_deadline timestamptz,p_environment text,p_request_id uuid,p_expected_room_session_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.watch_party_rooms; rs private.creator_room_sessions; a private.creator_room_seat_auctions; claim uuid; cap integer;
begin
 perform public.wave1_assert_current_creator_money_authority_internal();
 if p_request_id is null or p_expected_room_session_id is null then raise exception 'auction_creation_identity_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('room-auction-creation:'||auth.uid()::text||':'||p_request_id::text,0));
 perform private.lock_creator_room_inventory(p_party_id);
 perform public.wave1_assert_current_creator_money_authority_internal();
 select * into a from private.creator_room_seat_auctions where creator_id=auth.uid() and request_id=p_request_id;
 if a.id is not null then
   if row(a.party_id,a.source_kind,a.room_session_id,a.starting_amount_minor,a.min_increment_minor,a.closes_at,a.payment_deadline,a.environment)
     is distinct from row(p_party_id,p_source_kind,p_expected_room_session_id,p_starting_amount_minor,p_min_increment_minor,p_closes_at,p_payment_deadline,p_environment)
   then raise exception 'auction_creation_replay_mismatch'; end if;
   a:=private.advance_creator_room_seat_auction(a.id);
   return private.creator_room_seat_auction_safe_row(a);
 end if;
 select * into r from public.watch_party_rooms where party_id=p_party_id;
 if r.party_id is null or r.host_user_id is distinct from auth.uid() then raise exception 'room_creator_required'; end if;
 if p_source_kind is null or p_source_kind not in('stage_reserved_seat','party_admission')
   or (p_source_kind='stage_reserved_seat' and r.room_type<>'live') or (p_source_kind='party_admission' and r.room_type<>'title')
   or p_starting_amount_minor is null or p_starting_amount_minor<=0 or p_min_increment_minor is null or p_min_increment_minor<=0
   or p_starting_amount_minor::bigint+p_min_increment_minor>2147483647 or p_environment is null or p_environment not in('test','live')
   or p_closes_at is null or not isfinite(p_closes_at) or p_closes_at<=clock_timestamp()
   or p_payment_deadline is null or not isfinite(p_payment_deadline) or p_payment_deadline<=p_closes_at+interval '31 minutes'
   or p_payment_deadline>p_closes_at+interval '24 hours' then raise exception 'auction_terms_invalid'; end if;
 rs:=private.ensure_creator_room_session(p_party_id);
 if rs.id is distinct from p_expected_room_session_id then raise exception 'room_session_changed'; end if;
 a.party_id:=p_party_id;a.room_session_id:=rs.id;a.creator_id:=auth.uid();a.source_kind:=p_source_kind;a.environment:=p_environment;
 if not private.creator_room_seat_auction_source_valid(a) then raise exception 'auction_source_unavailable'; end if;
 select * into a from private.creator_room_seat_auctions where room_session_id=rs.id and source_kind=p_source_kind
   and state in('open','awarded','payment_pending','reconciliation_required') order by created_at,id limit 1;
 if a.id is not null then
   a:=private.advance_creator_room_seat_auction(a.id);
   if a.state in('open','awarded','payment_pending','reconciliation_required') then
     raise exception 'auction_existing_lot_unresolved';
   end if;
 end if;
 if p_source_kind='stage_reserved_seat' then cap:=4;
 else select seat_limit into cap from public.paid_watch_party_offers where party_id=p_party_id; end if;
 if cap is null or private.creator_room_seat_inventory(p_party_id,p_source_kind)>=cap then raise exception 'room_seat_sold_out'; end if;
 insert into private.creator_room_seat_claims(room_session_id,party_id,source_kind,state,expires_at)
 values(rs.id,p_party_id,p_source_kind,'auction_hold',p_payment_deadline) returning id into claim;
 insert into private.creator_room_seat_auctions(party_id,room_session_id,claim_id,source_kind,creator_id,request_id,starting_amount_minor,
   min_increment_minor,currency,environment,closes_at,payment_deadline)
 values(p_party_id,rs.id,claim,p_source_kind,auth.uid(),p_request_id,p_starting_amount_minor,p_min_increment_minor,'usd',p_environment,p_closes_at,p_payment_deadline)
 returning * into a;
 update private.creator_room_seat_claims set auction_id=a.id where id=claim;
 return private.creator_room_seat_auction_safe_row(a);
end; $$;
revoke all on function public.create_creator_room_seat_auction(text,text,integer,integer,timestamptz,timestamptz,text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.create_creator_room_seat_auction(text,text,integer,integer,timestamptz,timestamptz,text,uuid,uuid) to authenticated;

create function public.read_creator_room_seat_auction(p_auction_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.creator_room_seat_auctions;
begin
  if auth.uid() is null or not public.wave1_current_caller_authority_internal() or public.is_account_access_restricted(auth.uid()::text)
  then raise exception 'buyer_session_authority_required'; end if;
  select * into a from private.creator_room_seat_auctions where id=p_auction_id;
  if a.id is null or not private.creator_room_seat_subject_allowed(a.party_id,auth.uid()) then raise exception 'auction_not_found'; end if;
  perform private.lock_creator_room_inventory(a.party_id);
  if not public.wave1_current_caller_authority_internal() or public.is_account_access_restricted(auth.uid()::text)
  then raise exception 'buyer_session_authority_required'; end if;
  a:=private.advance_creator_room_seat_auction(a.id);
  return private.creator_room_seat_auction_safe_row(a);
end; $$;
revoke all on function public.read_creator_room_seat_auction(uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_creator_room_seat_auction(uuid) to authenticated;
create function public.close_creator_room_seat_auction(p_auction_id uuid)
returns jsonb language sql volatile security definer set search_path='' as $$ select public.read_creator_room_seat_auction(p_auction_id); $$;
revoke all on function public.close_creator_room_seat_auction(uuid) from public,anon,authenticated,service_role;
grant execute on function public.close_creator_room_seat_auction(uuid) to authenticated;
create function public.list_creator_room_seat_auctions(p_party_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb:='[]'::jsonb; a record;
begin
  if auth.uid() is null or not public.wave1_current_caller_authority_internal() or public.is_account_access_restricted(auth.uid()::text)
    or not private.creator_room_seat_subject_allowed(p_party_id,auth.uid()) then raise exception 'auction_not_found'; end if;
  for a in select id from private.creator_room_seat_auctions where party_id=p_party_id order by created_at desc,id limit 50
  loop result:=result||jsonb_build_array(public.read_creator_room_seat_auction(a.id)); end loop;
  return result;
end; $$;
revoke all on function public.list_creator_room_seat_auctions(text) from public,anon,authenticated,service_role;
grant execute on function public.list_creator_room_seat_auctions(text) to authenticated;

create function public.place_creator_room_seat_auction_bid(p_auction_id uuid,p_amount_minor integer,p_request_id uuid,p_capability_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.creator_room_seat_auctions;b private.creator_room_seat_auction_bids; prior private.creator_room_seat_auction_bids;
begin
  if auth.uid() is null or not public.wave1_current_caller_authority_internal() or public.is_account_access_restricted(auth.uid()::text)
  then raise exception 'buyer_session_authority_required'; end if;
  if p_request_id is null then raise exception 'auction_bid_identity_required'; end if;
  select * into a from private.creator_room_seat_auctions where id=p_auction_id;
  if a.id is null then raise exception 'auction_not_found'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'creator-money-source-intent:'||auth.uid()::text||':room:'||a.party_id,0));
  perform private.lock_creator_room_inventory(a.party_id);
  if not public.wave1_current_caller_authority_internal() or public.is_account_access_restricted(auth.uid()::text)
  then raise exception 'buyer_session_authority_required'; end if;
  a:=private.advance_creator_room_seat_auction(a.id);
  perform private.assert_creator_room_seat_auction_buyer(a,auth.uid());
  select * into prior from private.creator_room_seat_auction_bids where buyer_id=auth.uid() and request_id=p_request_id;
  if prior.id is not null then
    if prior.auction_id<>a.id or prior.amount_minor is distinct from p_amount_minor then raise exception 'auction_bid_replay_mismatch'; end if;
    return private.creator_room_seat_auction_safe_row(a);
  end if;
  if a.state<>'open' or a.closes_at<=clock_timestamp() then raise exception 'auction_bidding_closed'; end if;
  select * into b from private.creator_room_seat_auction_bids where id=a.highest_bid_id;
  if p_amount_minor is null or p_amount_minor<a.starting_amount_minor
    or (b.id is not null and p_amount_minor::bigint<b.amount_minor::bigint+a.min_increment_minor)
  then raise exception 'auction_bid_below_minimum'; end if;
  perform private.resolve_creator_external_payment_capability(auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid,
    'room_seat_auction',a.creator_id,p_amount_minor,a.currency,a.environment,p_capability_id);
  -- Capability evidence can itself wait on an issuer update. Never accept a
  -- bid whose final authorization arrived after the advertised hard close.
  if a.closes_at<=clock_timestamp() then raise exception 'auction_bidding_closed'; end if;
  insert into private.creator_room_seat_auction_bids(auction_id,buyer_id,amount_minor,request_id)
    values(a.id,auth.uid(),p_amount_minor,p_request_id) returning * into b;
  update private.creator_room_seat_auctions set highest_bid_id=b.id where id=a.id returning * into a;
  return private.creator_room_seat_auction_safe_row(a);
end; $$;
revoke all on function public.place_creator_room_seat_auction_bid(uuid,integer,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.place_creator_room_seat_auction_bid(uuid,integer,uuid,uuid) to authenticated;

create function public.read_creator_room_seat_auction_bid_eligibility(p_auction_id uuid,p_amount_minor integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.creator_room_seat_auctions;
begin
  if auth.uid() is null or not public.wave1_current_caller_authority_internal() or public.is_account_access_restricted(auth.uid()::text)
  then raise exception 'buyer_session_authority_required'; end if;
  select * into a from private.creator_room_seat_auctions where id=p_auction_id;
  if a.id is null or not private.creator_room_seat_subject_allowed(a.party_id,auth.uid()) then raise exception 'auction_not_found'; end if;
  perform private.assert_creator_room_seat_auction_buyer(a,auth.uid());
  if a.state not in('open','awarded') or not private.creator_room_seat_auction_source_valid(a)
    or (a.state='open' and a.closes_at<=clock_timestamp()) or a.payment_deadline<=clock_timestamp()
    or (a.state='awarded' and (a.winner_id is distinct from auth.uid() or a.payment_deadline<clock_timestamp()+interval '31 minutes'))
  then return jsonb_build_object('available',false,'unavailableReason','auction_unavailable'); end if;
  perform private.resolve_creator_external_payment_capability(auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid,
    'room_seat_auction',a.creator_id,p_amount_minor,a.currency,a.environment,null);
  return jsonb_build_object('available',true,'unavailableReason',null);
exception when raise_exception then
  if sqlerrm in('external_payment_capability_unavailable','auction_owner_cannot_bid','auction_buyer_unavailable','auction_existing_ticket_or_payment')
  then return jsonb_build_object('available',false,'unavailableReason',sqlerrm); end if;
  raise;
end; $$;
revoke all on function public.read_creator_room_seat_auction_bid_eligibility(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.read_creator_room_seat_auction_bid_eligibility(uuid,integer) to authenticated;

create function private.creator_room_seat_auction_quote_safe_row(q private.creator_room_auction_quotes)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',q.id,'auctionId',q.auction_id,'amountMinor',q.amount_minor,'currency',q.currency,
   'partyId',a.party_id,'roomSessionId',a.room_session_id,'claimId',a.claim_id,'sourceKind',a.source_kind,'creatorId',a.creator_id,
   'environment',q.environment,'expiresAt',q.expires_at,'state',a.state,
   'checkoutStarted',q.checkout_started_at is not null) from private.creator_room_seat_auctions a where a.id=q.auction_id;
$$;
revoke all on function private.creator_room_seat_auction_quote_safe_row(private.creator_room_auction_quotes) from public,anon,authenticated,service_role;
create function public.create_creator_room_seat_auction_award_quote(p_auction_id uuid,p_capability_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.creator_room_seat_auctions;q private.creator_room_auction_quotes;c jsonb;s uuid;
begin
  if auth.uid() is null or not public.wave1_current_caller_authority_internal() or public.is_account_access_restricted(auth.uid()::text)
  then raise exception 'buyer_session_authority_required'; end if;
  s:=nullif(auth.jwt()->>'session_id','')::uuid;
  select * into a from private.creator_room_seat_auctions where id=p_auction_id;
  if a.id is null then raise exception 'auction_not_found'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'creator-money-source-intent:'||auth.uid()::text||':room:'||a.party_id,0));
  perform private.lock_creator_room_inventory(a.party_id);
  if not public.wave1_current_caller_authority_internal() or public.is_account_access_restricted(auth.uid()::text)
  then raise exception 'buyer_session_authority_required'; end if;
  a:=private.advance_creator_room_seat_auction(a.id);
  if a.winner_id is distinct from auth.uid() then raise exception 'auction_winner_required'; end if;
  select * into q from private.creator_room_auction_quotes where auction_id=a.id and superseded_at is null for update;
  if q.id is not null then
    if q.session_id=s then return private.creator_room_seat_auction_quote_safe_row(q); end if;
    if a.state<>'awarded' or q.checkout_attempt_id is not null or q.checkout_started_at is not null
      or q.purchase_intent_id is not null or q.provider_checkout_session_id is not null or q.provider_payment_intent_id is not null
    then raise exception 'auction_quote_session_changed'; end if;
  end if;
  if a.state<>'awarded' or a.payment_deadline<clock_timestamp()+interval '31 minutes' then raise exception 'auction_award_unavailable'; end if;
  perform private.assert_creator_room_seat_auction_buyer(a,auth.uid());
  c:=private.resolve_creator_external_payment_capability(auth.uid(),s,'room_seat_auction',a.creator_id,a.award_amount_minor,
    a.currency,a.environment,p_capability_id);
  if q.id is not null then
    -- The obsolete quote can never be dispatched, including by the old login.
    -- Preserve its identity/evidence instead of mutating it to another session.
    update private.creator_room_auction_quotes set superseded_at=clock_timestamp() where id=q.id;
  end if;
  insert into private.creator_room_auction_quotes(auction_id,buyer_id,creator_id,session_id,capability_id,eligibility_id,
    provider_account_id,amount_minor,currency,environment,expires_at)
  values(a.id,auth.uid(),a.creator_id,s,(c->>'capabilityId')::uuid,(c->>'eligibilityId')::uuid,c->>'providerAccountId',
    a.award_amount_minor,a.currency,a.environment,a.payment_deadline) returning * into q;
  return private.creator_room_seat_auction_quote_safe_row(q);
end; $$;
revoke all on function public.create_creator_room_seat_auction_award_quote(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.create_creator_room_seat_auction_award_quote(uuid,uuid) to authenticated;

create function public.claim_creator_room_auction_checkout(p_quote_id uuid,p_buyer_id uuid,p_session_id uuid,p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.creator_room_seat_auctions;q private.creator_room_auction_quotes;c jsonb; authorized boolean:=false;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
  if p_attempt_id is null or p_session_id is null then raise exception 'auction_checkout_identity_required'; end if;
  select * into q from private.creator_room_auction_quotes where id=p_quote_id;
  if q.id is null or q.superseded_at is not null or q.buyer_id is distinct from p_buyer_id or q.session_id is distinct from p_session_id
  then raise exception 'auction_quote_not_found'; end if;
  select * into a from private.creator_room_seat_auctions where id=q.auction_id;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'creator-money-source-intent:'||p_buyer_id::text||':room:'||a.party_id,0));
  perform private.lock_creator_room_inventory(a.party_id);
  a:=private.advance_creator_room_seat_auction(a.id);
  select * into q from private.creator_room_auction_quotes where id=p_quote_id for update;
  if q.superseded_at is not null then raise exception 'auction_quote_superseded'; end if;
  if not public.money_purchase_intent_session_authorized_internal(p_buyer_id,p_session_id::text)
    or public.is_account_access_restricted(p_buyer_id::text) then raise exception 'buyer_session_authority_required'; end if;
  if q.checkout_attempt_id is null then
    if a.state<>'awarded' or a.winner_id is distinct from p_buyer_id or q.expires_at<clock_timestamp()+interval '31 minutes'
      or not private.creator_room_seat_auction_source_valid(a) then raise exception 'auction_award_unavailable'; end if;
    perform private.assert_creator_room_seat_auction_buyer(a,p_buyer_id);
    c:=private.resolve_creator_external_payment_capability(p_buyer_id,p_session_id,'room_seat_auction',a.creator_id,
      q.amount_minor,q.currency,q.environment,q.capability_id);
    if c->>'providerAccountId' is distinct from q.provider_account_id
    then raise exception 'external_payment_capability_unavailable'; end if;
    if q.expires_at<clock_timestamp()+interval '31 minutes' then raise exception 'auction_award_unavailable'; end if;
    update private.creator_room_auction_quotes set checkout_attempt_id=p_attempt_id,checkout_started_at=clock_timestamp(),
      checkout_eligibility_id=(c->>'eligibilityId')::uuid
      where id=q.id returning * into q;
    update private.creator_room_seat_auctions set state='payment_pending' where id=a.id returning * into a;
    update private.creator_room_seat_claims set state='payment_pending',updated_at=clock_timestamp() where id=a.claim_id;
    authorized:=true;
  end if;
  return jsonb_build_object('startAuthorized',authorized,'quoteId',q.id,'auctionId',a.id,'partyId',a.party_id,
    'roomSessionId',a.room_session_id,'claimId',a.claim_id,'sourceKind',a.source_kind,'buyerId',q.buyer_id,'creatorId',q.creator_id,
    'amountMinor',q.amount_minor,'currency',q.currency,'providerAccountId',q.provider_account_id,'environment',q.environment,
    'expiresAt',q.expires_at,'checkoutAttemptId',q.checkout_attempt_id,'providerCheckoutSessionId',q.provider_checkout_session_id,
    'capabilityId',q.capability_id,'eligibilityId',q.eligibility_id,
    'routeKind',c->>'routeKind','platform',c->>'platform','storefrontCountry',c->>'storefrontCountry');
end; $$;
revoke all on function public.claim_creator_room_auction_checkout(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.claim_creator_room_auction_checkout(uuid,uuid,uuid,uuid) to service_role;
