-- Paid Events V1 proof fix: replace the stale trigger body that referenced the
-- old event access grant schema. The current access_grants table uses
-- grant_type/source_id and sandbox_only status.

create or replace function public."sync_paid_creator_event_pass_from_access_grant"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public."paid_creator_events"%rowtype;
  v_provider public."provider_events"%rowtype;
  v_ledger public."money_access_ledger_events"%rowtype;
  v_transaction public."creator_event_transactions"%rowtype;
  v_pass public."paid_creator_event_passes"%rowtype;
  v_active boolean;
begin
  if new."grant_type" <> 'event_pass' or new."source_id" is null then
    return new;
  end if;

  select * into v_offer
  from public."paid_creator_events"
  where "creator_event_id" = new."source_id"
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

  return new;
end;
$$;
