-- Paid Watch-Party Seats V1 oversell guard.
-- This applies after the base ticket tables are present and keeps verified
-- provider events from creating active tickets beyond the configured seat cap.

create or replace function public."prevent_paid_watch_party_ticket_oversell"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public."paid_watch_party_offers"%rowtype;
  v_active_count integer := 0;
begin
  if new."status" <> 'active' then
    return new;
  end if;

  select * into v_offer
  from public."paid_watch_party_offers"
  where "id" = new."offer_id"
  for update;

  if v_offer."id" is null or v_offer."seat_limit" is null then
    return new;
  end if;

  select count(*)::integer into v_active_count
  from public."paid_watch_party_tickets" ticket
  where ticket."offer_id" = new."offer_id"
    and ticket."status" = 'active'
    and ticket."refunded_at" is null
    and ticket."revoked_at" is null
    and (ticket."expires_at" is null or ticket."expires_at" > timezone('utc'::text, now()));

  if v_active_count < v_offer."seat_limit" then
    return new;
  end if;

  update public."creator_room_ticket_transactions"
  set
    "status" = 'canceled',
    "metadata" = "metadata" || jsonb_build_object('blocked_reason', 'sold_out', 'access_granted', false)
  where "id" = new."source_transaction_id";

  update public."paid_watch_party_offers"
  set
    "status" = 'sold_out',
    "seats_sold" = v_active_count,
    "updated_at" = timezone('utc'::text, now())
  where "id" = new."offer_id";

  insert into public."room_ticket_events" ("offer_id", "transaction_id", "actor_id", "event_type", "metadata")
  values (
    new."offer_id",
    new."source_transaction_id",
    new."buyer_id",
    'ticket_blocked_sold_out',
    jsonb_build_object('sandbox_only', true, 'access_granted', false)
  );

  return null;
end;
$$;

drop trigger if exists "prevent_paid_watch_party_ticket_oversell_insert" on public."paid_watch_party_tickets";
create trigger "prevent_paid_watch_party_ticket_oversell_insert"
  before insert on public."paid_watch_party_tickets"
  for each row
  execute function public."prevent_paid_watch_party_ticket_oversell"();

revoke all on function public."prevent_paid_watch_party_ticket_oversell"() from public;

comment on function public."prevent_paid_watch_party_ticket_oversell"() is
  'Prevents active Paid Watch-Party ticket creation beyond seat_limit after provider verification. Skipped tickets do not grant room access, LiveKit authority, Premium, Tips, Paid Videos, payouts, or live money.';
