-- Server lifecycle and existing notification outbox integration. No historical
-- backfill, provider request, cron activation or financial authority is created.
do $$ declare d text; begin
  select pg_get_constraintdef(oid) into d from pg_constraint
    where conrelid='public.notifications'::regclass and conname='notifications_notification_type_check';
  if d is null then raise exception 'notification_type_constraint_missing'; end if;
  alter table public.notifications drop constraint notifications_notification_type_check;
  execute 'alter table public.notifications add constraint notifications_notification_type_check check ('
    ||substring(d from 7)||' or notification_type in (''auction_outbid'',''auction_won'',''auction_creator_award'',
    ''auction_checkout_deadline'',''auction_payment_deadline''))';
end $$;

create function private.enqueue_creator_auction_activity()
returns trigger language plpgsql security definer set search_path='' as $$
declare family text; prior_buyer uuid; bidder uuid; context jsonb; prefix text;
begin
  family:=case tg_table_name when 'creator_event_auctions' then 'event' else 'room' end;
  context:=jsonb_build_object('family',family);
  prefix:='auction:'||family||':'||new.id::text||':';
  if new.highest_bid_id is distinct from old.highest_bid_id and old.highest_bid_id is not null then
    if family='event' then
      select buyer_id into prior_buyer from private.creator_event_auction_bids where id=old.highest_bid_id and auction_id=new.id;
      select buyer_id into bidder from private.creator_event_auction_bids where id=new.highest_bid_id and auction_id=new.id;
    else
      select buyer_id into prior_buyer from private.creator_room_seat_auction_bids where id=old.highest_bid_id and auction_id=new.id;
      select buyer_id into bidder from private.creator_room_seat_auction_bids where id=new.highest_bid_id and auction_id=new.id;
    end if;
    if prior_buyer is distinct from bidder then
      perform private.enqueue_notification_activity(prefix||'outbid:'||new.highest_bid_id::text,
        'auction_outbid',new.id::text,new.creator_id,prior_buyer,
        context||jsonb_build_object('priorBidId',old.highest_bid_id,'replacingBidId',new.highest_bid_id),
        clock_timestamp(),new.closes_at);
    end if;
  end if;
  if new.state='awarded' and old.state is distinct from 'awarded' and new.winner_id is not null then
    perform private.enqueue_notification_activity(prefix||'won','auction_won',new.id::text,new.creator_id,new.winner_id,
      context,clock_timestamp(),new.payment_deadline);
    -- Creator copy never describes an unpaid award as a sale.
    perform private.enqueue_notification_activity(prefix||'creator-award','auction_creator_award',new.id::text,null,new.creator_id,
      context,clock_timestamp(),new.payment_deadline);
    perform private.enqueue_notification_activity(prefix||'checkout-deadline','auction_checkout_deadline',new.id::text,new.creator_id,new.winner_id,
      context,greatest(clock_timestamp(),new.payment_deadline-interval '36 minutes'),new.payment_deadline-interval '31 minutes');
    perform private.enqueue_notification_activity(prefix||'payment-deadline','auction_payment_deadline',new.id::text,new.creator_id,new.winner_id,
      context,greatest(clock_timestamp(),new.payment_deadline-interval '5 minutes'),new.payment_deadline);
  end if;
  return new;
end $$;
revoke all on function private.enqueue_creator_auction_activity() from public,anon,authenticated,service_role;
create trigger creator_event_auction_activity after update on private.creator_event_auctions
for each row execute function private.enqueue_creator_auction_activity();
create trigger creator_room_auction_activity after update on private.creator_room_seat_auctions
for each row execute function private.enqueue_creator_auction_activity();

-- Preserve all existing seat notifications and the common preference, account,
-- audience-block, deletion, expiry and token ownership checks.
alter function private.resolve_seat_notification_activity(public.notification_activity_events)
rename to resolve_seat_notification_activity_before_auctions;
create function private.resolve_seat_notification_activity(p_event public.notification_activity_events)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a jsonb; buyer uuid; current_buyer uuid; route text; entity text; kind text:=p_event.event_kind;
begin
  if kind not in ('auction_outbid','auction_won','auction_creator_award','auction_checkout_deadline','auction_payment_deadline') then
    return private.resolve_seat_notification_activity_before_auctions(p_event);
  end if;
  if p_event.context->>'family'='event' then
    select to_jsonb(x) into a from private.creator_event_auctions x where x.id=private.seat_notification_uuid(p_event.source_id)
      and private.creator_event_auction_source_valid(x);
    route:='/event/[eventId]'; entity:=a->>'event_id';
    if kind='auction_outbid' then
      select buyer_id into buyer from private.creator_event_auction_bids where id=private.seat_notification_uuid(p_event.context->>'priorBidId') and auction_id=private.seat_notification_uuid(p_event.source_id);
      select buyer_id into current_buyer from private.creator_event_auction_bids where id=private.seat_notification_uuid(a->>'highest_bid_id');
    end if;
  elsif p_event.context->>'family'='room' then
    select to_jsonb(x) into a from private.creator_room_seat_auctions x where x.id=private.seat_notification_uuid(p_event.source_id)
      and private.creator_room_seat_auction_source_valid(x);
    route:=case a->>'source_kind' when 'stage_reserved_seat' then '/watch-party/live-stage/[partyId]' else '/watch-party/[partyId]' end;
    entity:=a->>'party_id';
    if not exists(select 1 from private.creator_room_sessions s where s.id=private.seat_notification_uuid(a->>'room_session_id') and s.ended_at is null)
      then return '{"eligible":false}'; end if;
    if kind='auction_outbid' then
      select buyer_id into buyer from private.creator_room_seat_auction_bids where id=private.seat_notification_uuid(p_event.context->>'priorBidId') and auction_id=private.seat_notification_uuid(p_event.source_id);
      select buyer_id into current_buyer from private.creator_room_seat_auction_bids where id=private.seat_notification_uuid(a->>'highest_bid_id');
    end if;
  else return '{"eligible":false}'; end if;
  if a is null then return '{"eligible":false}'; end if;
  if kind='auction_creator_award' then
    if p_event.recipient_user_id::text is distinct from a->>'creator_id' or p_event.actor_user_id is not null
      or a->>'state' not in('awarded','payment_pending') then return '{"eligible":false}'; end if;
  else
    if p_event.actor_user_id::text is distinct from a->>'creator_id' then return '{"eligible":false}'; end if;
    if kind='auction_outbid' then
      if buyer is distinct from p_event.recipient_user_id or current_buyer is null or current_buyer=buyer
        or a->>'state'<>'open' or (a->>'closes_at')::timestamptz<=now() then return '{"eligible":false}'; end if;
    elsif p_event.recipient_user_id::text is distinct from a->>'winner_id' or a->>'state' not in('awarded','payment_pending')
      or (a->>'payment_deadline')::timestamptz<=now() then return '{"eligible":false}';
    elsif kind='auction_checkout_deadline' and a->>'state'<>'awarded' then return '{"eligible":false}';
    end if;
  end if;
  return jsonb_build_object('eligible',true,'category',case when kind='auction_creator_award' then 'creator_money_sale' else 'creator_money_purchase' end,
    'notification_type',kind,'preference_key',case when p_event.context->>'family'='room' then 'seat_activity_enabled' else 'event_updates_enabled' end,
    'title',case kind when 'auction_outbid' then 'Your bid was outbid' when 'auction_won' then 'You won the auction'
      when 'auction_creator_award' then 'Auction awarded: payment pending' when 'auction_checkout_deadline' then 'Auction checkout deadline approaching' else 'Auction payment deadline approaching' end,
    'body',case kind when 'auction_outbid' then 'Open the auction to review its current price and closing time. No payment was taken for bidding.'
      when 'auction_won' then 'Review your winning amount and payment deadline. Winning alone does not grant admission.'
      when 'auction_creator_award' then 'A winner was selected. Payment and access still require verification.'
      when 'auction_checkout_deadline' then 'Open the auction before its checkout-start deadline if you want to complete your winning purchase.'
      else 'Check your existing checkout and payment status. Do not start a second payment.' end,
    'target_route',route,'target_entity_id',entity,'target_context',jsonb_build_object('auctionId',p_event.source_id,
      'action_expires_at',p_event.expires_at));
end $$;
revoke all on function private.resolve_seat_notification_activity(public.notification_activity_events),
private.resolve_seat_notification_activity_before_auctions(public.notification_activity_events) from public,anon,authenticated,service_role;

create index creator_event_auction_due on private.creator_event_auctions(closes_at,event_id,id) where state='open';
create index creator_event_award_due on private.creator_event_auctions(payment_deadline,event_id,id) where state='awarded';
create index creator_room_auction_due on private.creator_room_seat_auctions(closes_at,party_id,id) where state='open';
create index creator_room_award_due on private.creator_room_seat_auctions(payment_deadline,party_id,id) where state='awarded';

create function private.tick_creator_auctions(p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='200ms' set statement_timeout='10s' as $$
declare a record; processed integer:=0; busy integer:=0;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('creator-auction-lifecycle-tick',0)) then return '{"busy":true}'; end if;
  -- Lock the same parent before each auction as buyer/creator operations. Never
  -- acquire an auction row before its event/room inventory lock.
  for a in select id,event_id from private.creator_event_auctions where
    (state='open' and closes_at<=clock_timestamp()) or (state='awarded' and payment_deadline<=clock_timestamp())
    order by event_id,id limit least(greatest(coalesce(p_limit,20),1),50)
  loop begin
    perform 1 from public.creator_events where id=a.event_id for update;
    perform private.advance_creator_event_auction(a.id); processed:=processed+1;
  exception when lock_not_available then busy:=busy+1; end; end loop;
  for a in select id,party_id from private.creator_room_seat_auctions where
    (state='open' and closes_at<=clock_timestamp()) or (state='awarded' and payment_deadline<=clock_timestamp())
    order by party_id,id limit least(greatest(coalesce(p_limit,20),1),50)
  loop begin
    perform private.lock_creator_room_inventory(a.party_id);
    perform private.advance_creator_room_seat_auction(a.id); processed:=processed+1;
  exception when lock_not_available then busy:=busy+1; end; end loop;
  return jsonb_build_object('processed',processed,'busy',busy);
end $$;
revoke all on function private.tick_creator_auctions(integer) from public,anon,authenticated,service_role;

-- Explicit deployment-time opt-in only. This migration does not run either
-- function, schedule work, enable push delivery, or change live-money switches.
create function private.configure_creator_auction_lifecycle()
returns bigint language sql security definer set search_path='' as $$
  select cron.schedule('creator-auction-lifecycle','10 seconds','select private.tick_creator_auctions(20)');
$$;
create function private.disable_creator_auction_lifecycle()
returns void language plpgsql security definer set search_path='' as $$
begin perform cron.unschedule(jobid) from cron.job where jobname='creator-auction-lifecycle'; end $$;
revoke all on function private.configure_creator_auction_lifecycle(),private.disable_creator_auction_lifecycle() from public,anon,authenticated,service_role;
