-- Fail closed atomically on ticket issuance refusal. No provider calls, money
-- activation, privilege expansion, historical rewriting, or automatic refunds.
-- Provider processing remains retryable/reconcilable instead of falsely verified.

CREATE OR REPLACE FUNCTION public.prevent_paid_watch_party_ticket_oversell()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- ON CONFLICT refresh of the same still-valid ticket consumes no new seat.
  -- Expired/refunded/revoked tickets must compete for capacity normally.
  if exists (select 1 from public.paid_watch_party_tickets t
    where t.offer_id=new.offer_id and t.buyer_id=new.buyer_id
      and t.status='active' and t.refunded_at is null and t.revoked_at is null
      and (t.expires_at is null or t.expires_at>timezone('utc'::text,now())))
  then return new; end if;

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
$function$
;

CREATE OR REPLACE FUNCTION public.sync_paid_watch_party_ticket_from_access_grant()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_offer public."paid_watch_party_offers"%rowtype;
  v_provider public."provider_events"%rowtype;
  v_ledger public."money_access_ledger_events"%rowtype;
  v_transaction public."creator_room_ticket_transactions"%rowtype;
  v_ticket public."paid_watch_party_tickets"%rowtype;
  v_active boolean;
begin
  if new."grant_type" <> 'watch_party_live_ticket' or new."source_id" is null then
    return new;
  end if;

  select * into v_offer
  from public."paid_watch_party_offers"
  where "id" = new."source_id"
  limit 1;

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

  insert into public."creator_room_ticket_transactions" (
    "offer_id",
    "party_id",
    "creator_id",
    "host_id",
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
    v_offer."party_id",
    v_offer."creator_id",
    v_offer."host_id",
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
      'live_stage_access', false
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
    if v_offer."seat_limit" is not null
      and not exists (
        select 1
        from public."paid_watch_party_tickets" existing_ticket
        where existing_ticket."offer_id" = v_offer."id"
          and existing_ticket."buyer_id" = new."user_id"
          and existing_ticket."status" = 'active'
      )
      and (
        select count(*)::integer
        from public."paid_watch_party_tickets" ticket
        where ticket."offer_id" = v_offer."id"
          and ticket."status" = 'active'
          and ticket."refunded_at" is null
          and ticket."revoked_at" is null
          and (ticket."expires_at" is null or ticket."expires_at" > timezone('utc'::text, now()))
      ) >= v_offer."seat_limit"
    then
      raise exception 'room_admission_sold_out';
    end if;

    insert into public."paid_watch_party_tickets" (
      "offer_id",
      "party_id",
      "buyer_id",
      "creator_id",
      "host_id",
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
      v_offer."party_id",
      new."user_id",
      v_offer."creator_id",
      v_offer."host_id",
      v_transaction."id",
      new."id",
      coalesce(new."provider", 'revenuecat_google_play'),
      v_provider."provider_event_id",
      'active',
      new."expires_at",
      jsonb_build_object(
        'sandbox_only', new."environment" = 'sandbox',
        'viewer_access_only', true
      )
    )
    on conflict ("offer_id", "buyer_id")
    where "status" = 'active'
    do update set
      "access_grant_id" = excluded."access_grant_id",
      "source_transaction_id" = excluded."source_transaction_id",
      "provider_transaction_id" = excluded."provider_transaction_id",
      "expires_at" = excluded."expires_at"
    returning * into v_ticket;

    -- A BEFORE INSERT guard may suppress issuance. Never commit a grant or
    -- verified event without the ticket that supplies room authority.
    if v_ticket."id" is null then
      raise exception 'room_admission_sold_out';
    end if;

    update public."paid_watch_party_offers" offer
    set
      "seats_sold" = (
        select count(*)::integer
        from public."paid_watch_party_tickets" ticket
        where ticket."offer_id" = offer."id"
          and ticket."status" = 'active'
          and ticket."refunded_at" is null
          and ticket."revoked_at" is null
          and (ticket."expires_at" is null or ticket."expires_at" > timezone('utc'::text, now()))
      ),
      "status" = case
        when offer."seat_limit" is not null
          and (
            select count(*)::integer
            from public."paid_watch_party_tickets" ticket
            where ticket."offer_id" = offer."id"
              and ticket."status" = 'active'
              and ticket."refunded_at" is null
              and ticket."revoked_at" is null
          ) >= offer."seat_limit"
        then 'sold_out'
        else offer."status"
      end,
      "updated_at" = timezone('utc'::text, now())
    where offer."id" = v_offer."id";
  else
    update public."paid_watch_party_tickets"
    set
      "status" = case when new."status" = 'refunded' then 'refunded' when new."status" = 'revoked' then 'revoked' else 'expired' end,
      "refunded_at" = new."refunded_at",
      "revoked_at" = coalesce(new."revoked_at", timezone('utc'::text, now()))
    where "access_grant_id" = new."id"
      and "status" = 'active';
  end if;

  insert into public."room_ticket_events" ("offer_id", "ticket_id", "transaction_id", "actor_id", "event_type", "metadata")
  values (
    v_offer."id",
    v_ticket."id",
    v_transaction."id",
    new."user_id",
    case when v_active then 'ticket_verified' else 'ticket_revoked' end,
    jsonb_build_object('provider_event_id', new."provider_event_id", 'sandbox_only', new."environment" = 'sandbox')
  );

  return new;
end;
$function$
;
