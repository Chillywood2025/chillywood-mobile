-- Paid Videos V1 sandbox bridge.
-- Uses existing RevenueCat / Google Play sandbox provider events and purchase
-- intents. This does not enable live money, payouts, cash-out, withdrawals,
-- Premium unlocks, Tips, LiveKit authority, room access, or Watch-Party routing.

alter table public."creator_content_prices"
  add column if not exists "provider" text not null default 'revenuecat_google_play',
  add column if not exists "provider_product_id" text,
  add column if not exists "provider_product_key" text,
  add column if not exists "metadata" jsonb not null default '{}'::jsonb;

alter table public."creator_content_prices"
  drop constraint if exists "creator_content_prices_status_check";

alter table public."creator_content_prices"
  add constraint "creator_content_prices_status_check"
  check ("status" in ('draft', 'sandbox', 'active', 'paused', 'blocked', 'archived'));

alter table public."creator_content_prices"
  add constraint "creator_content_prices_metadata_safe_check"
  check ("metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload|authorization)');

create index if not exists "creator_content_prices_content_status_idx"
  on public."creator_content_prices" ("content_type", "content_id", "status");

create index if not exists "creator_content_prices_provider_product_idx"
  on public."creator_content_prices" ("provider", "provider_product_id");

update public."platform_money_kill_switches"
set
  "state" = 'sandbox_only',
  "reason" = coalesce("reason", 'Paid Videos V1 sandbox proof enabled. Live money remains off.'),
  "updated_at" = timezone('utc'::text, now())
where "key" = 'paid_content_enabled'
  and "state" = 'off';

create or replace function public."sync_paid_content_access_grant_bridge"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new."grant_type" <> 'paid_content_access' or new."source_id" is null then
    return new;
  end if;

  if new."status" in ('active', 'sandbox_only')
    and new."refunded_at" is null
    and new."revoked_at" is null
    and new."starts_at" <= timezone('utc'::text, now())
    and (new."expires_at" is null or new."expires_at" > timezone('utc'::text, now()))
  then
    update public."content_access_grants"
    set
      "active" = false,
      "revoked_at" = coalesce("revoked_at", timezone('utc'::text, now()))
    where "user_id" = new."user_id"
      and "content_type" = 'creator_video'
      and "content_id" = new."source_id"
      and "active" = true
      and "source" = 'refund_revoked';

    insert into public."content_access_grants" (
      "user_id",
      "content_type",
      "content_id",
      "source",
      "purchase_id",
      "active"
    )
    select
      new."user_id",
      'creator_video',
      new."source_id",
      'purchase',
      null,
      true
    where not exists (
      select 1
      from public."content_access_grants" existing
      where existing."user_id" = new."user_id"
        and existing."content_type" = 'creator_video'
        and existing."content_id" = new."source_id"
        and existing."active" = true
    );
  else
    update public."content_access_grants"
    set
      "active" = false,
      "revoked_at" = coalesce("revoked_at", timezone('utc'::text, now()))
    where "user_id" = new."user_id"
      and "content_type" = 'creator_video'
      and "content_id" = new."source_id"
      and "active" = true
      and "source" = 'purchase';
  end if;

  return new;
end;
$$;

drop trigger if exists "sync_paid_content_access_grant_bridge_insert" on public."access_grants";
create trigger "sync_paid_content_access_grant_bridge_insert"
  after insert on public."access_grants"
  for each row
  execute function public."sync_paid_content_access_grant_bridge"();

drop trigger if exists "sync_paid_content_access_grant_bridge_update" on public."access_grants";
create trigger "sync_paid_content_access_grant_bridge_update"
  after update of "status", "refunded_at", "revoked_at", "expires_at" on public."access_grants"
  for each row
  execute function public."sync_paid_content_access_grant_bridge"();

create or replace function public."resolve_creator_content_access"(
  p_content_type text,
  p_content_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_creator_id uuid;
  v_price public."creator_content_prices"%rowtype;
  v_has_legacy_grant boolean := false;
  v_shared_grant jsonb;
begin
  if p_content_type = 'creator_video' then
    select video."owner_id" into v_creator_id
    from public."videos" video
    where video."id" = p_content_id
      and (
        video."visibility" = 'public'
        or video."owner_id" = v_viewer_id
        or public.has_platform_role(array['owner'::text, 'operator'::text])
      )
      and (
        video."owner_id" = v_viewer_id
        or public.has_platform_role(array['owner'::text, 'operator'::text])
        or coalesce(video."moderation_status", 'clean') in ('clean', 'reported')
      );
  else
    return jsonb_build_object('allowed', false, 'reason', 'unsupported_content_type');
  end if;

  if v_creator_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'content_unavailable');
  end if;

  if v_viewer_id is not null and v_viewer_id = v_creator_id then
    return jsonb_build_object('allowed', true, 'reason', 'owner', 'requiresPurchase', false);
  end if;

  select * into v_price
  from public."creator_content_prices" price
  where price."content_type" = p_content_type
    and price."content_id" = p_content_id
    and price."status" in ('sandbox', 'active')
    and price."is_paid" = true
  limit 1;

  if v_price."id" is null then
    return jsonb_build_object('allowed', true, 'reason', 'free_content', 'requiresPurchase', false);
  end if;

  if v_viewer_id is not null then
    select exists (
      select 1
      from public."content_access_grants" access
      where access."user_id" = v_viewer_id
        and access."content_type" = p_content_type
        and access."content_id" = p_content_id
        and access."active" = true
        and access."source" in ('purchase', 'admin')
        and access."revoked_at" is null
    ) into v_has_legacy_grant;

    if v_has_legacy_grant then
      return jsonb_build_object('allowed', true, 'reason', 'purchase_grant', 'requiresPurchase', false);
    end if;

    v_shared_grant := public."has_access_grant"('paid_content_access', p_content_id, v_viewer_id);
    if (v_shared_grant->>'allowed')::boolean then
      return jsonb_build_object(
        'allowed', true,
        'reason', coalesce(v_shared_grant->>'reason', 'purchase_grant'),
        'requiresPurchase', false,
        'environment', coalesce(v_shared_grant->>'environment', 'unknown')
      );
    end if;
  end if;

  return jsonb_build_object(
    'allowed', false,
    'reason', 'purchase_required',
    'requiresPurchase', true,
    'priceCents', v_price."price_cents",
    'currency', v_price."currency",
    'creatorId', v_creator_id,
    'provider', v_price."provider",
    'providerProductId', v_price."provider_product_id",
    'providerProductKey', v_price."provider_product_key",
    'offerStatus', v_price."status"
  );
end;
$$;

create or replace function public."set_creator_content_price"(
  p_content_type text,
  p_content_id uuid,
  p_is_paid boolean,
  p_price_cents integer,
  p_currency text default 'usd'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_settings public."monetization_system_settings"%rowtype;
  v_creator_id uuid;
  v_price_id uuid;
  v_currency text := lower(trim(coalesce(p_currency, 'usd')));
  v_price_cents integer := greatest(coalesce(p_price_cents, 0), 0);
  v_paid_content_switch text := coalesce((
    select "state" from public."platform_money_kill_switches"
    where "key" = 'paid_content_enabled'
    limit 1
  ), 'off');
  v_provider_switch text := coalesce((
    select "state" from public."platform_money_kill_switches"
    where "key" = 'revenuecat_google_play_enabled'
    limit 1
  ), 'off');
  v_product public."monetization_products"%rowtype;
begin
  if v_actor_id is null then
    raise exception 'monetization_auth_required';
  end if;

  select * into v_settings from public."monetization_system_settings" where "id" = true;

  if p_content_type = 'creator_video' then
    select video."owner_id" into v_creator_id
    from public."videos" video
    where video."id" = p_content_id;
  else
    return jsonb_build_object('status', 'blocked', 'reason', 'unsupported_content_type');
  end if;

  if v_creator_id is null or v_creator_id <> v_actor_id then
    perform public."monetization_write_audit"(
      v_actor_id,
      'creator_pricing_blocked_not_owner',
      p_content_type,
      p_content_id::text
    );
    raise exception 'monetization_content_owner_required';
  end if;

  if v_currency <> 'usd' then
    raise exception 'monetization_currency_not_supported';
  end if;

  if p_is_paid and (
    v_price_cents < coalesce(v_settings."min_price_cents", 99)
    or v_price_cents > coalesce(v_settings."max_price_cents", 50000)
  ) then
    raise exception 'monetization_price_out_of_range';
  end if;

  if p_is_paid and v_paid_content_switch not in ('sandbox_only', 'on') then
    perform public."monetization_write_audit"(
      v_actor_id,
      'creator_pricing_blocked_disabled',
      p_content_type,
      p_content_id::text,
      jsonb_build_object('paid_content_switch', v_paid_content_switch)
    );
    return jsonb_build_object('status', 'blocked', 'reason', 'paid_content_disabled');
  end if;

  if p_is_paid and v_provider_switch not in ('sandbox_only', 'on') then
    return jsonb_build_object('status', 'blocked', 'reason', 'provider_not_ready');
  end if;

  if p_is_paid then
    select * into v_product
    from public."monetization_products"
    where "product_key" = 'paid_content_access_sandbox_099'
      and "product_type" = 'paid_content_access'
      and "provider" in ('revenuecat_google_play', 'google_play', 'revenuecat')
      and "environment" = 'sandbox'
      and "status" = 'sandbox'
    limit 1;

    if v_product."id" is null or nullif(trim(coalesce(v_product."provider_product_id", '')), '') is null then
      return jsonb_build_object('status', 'blocked', 'reason', 'provider_product_missing');
    end if;
  end if;

  insert into public."creator_content_prices" (
    "creator_id",
    "content_type",
    "content_id",
    "is_paid",
    "price_cents",
    "currency",
    "status",
    "provider",
    "provider_product_id",
    "provider_product_key",
    "metadata"
  )
  values (
    v_actor_id,
    p_content_type,
    p_content_id,
    p_is_paid,
    case when p_is_paid then v_price_cents else 0 end,
    v_currency,
    case when p_is_paid then 'sandbox' else 'paused' end,
    'revenuecat_google_play',
    case when p_is_paid then v_product."provider_product_id" else null end,
    case when p_is_paid then v_product."product_key" else null end,
    jsonb_build_object(
      'sandbox_only', p_is_paid,
      'live_money_enabled_at_save', coalesce((select "state" = 'on' from public."platform_money_kill_switches" where "key" = 'live_money_enabled'), false),
      'premium_unlock', false,
      'tips_path', false
    )
  )
  on conflict ("content_type", "content_id")
  do update set
    "creator_id" = excluded."creator_id",
    "is_paid" = excluded."is_paid",
    "price_cents" = excluded."price_cents",
    "currency" = excluded."currency",
    "status" = excluded."status",
    "provider" = excluded."provider",
    "provider_product_id" = excluded."provider_product_id",
    "provider_product_key" = excluded."provider_product_key",
    "metadata" = excluded."metadata",
    "updated_at" = timezone('utc'::text, now())
  returning "id" into v_price_id;

  perform public."monetization_write_audit"(
    v_actor_id,
    'creator_content_price_set',
    p_content_type,
    p_content_id::text,
    jsonb_build_object(
      'is_paid', p_is_paid,
      'price_cents', case when p_is_paid then v_price_cents else 0 end,
      'status', case when p_is_paid then 'sandbox' else 'paused' end,
      'provider', 'revenuecat_google_play'
    )
  );

  return jsonb_build_object(
    'status', 'saved',
    'id', v_price_id,
    'offerStatus', case when p_is_paid then 'sandbox' else 'paused' end,
    'providerProductId', case when p_is_paid then v_product."provider_product_id" else null end,
    'providerProductKey', case when p_is_paid then v_product."product_key" else null end
  );
end;
$$;

create or replace function public."list_my_paid_video_offers"()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'monetization_auth_required';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', price."id",
      'videoId', price."content_id",
      'creatorId', price."creator_id",
      'title', coalesce(video."title", 'Untitled Video'),
      'priceCents', price."price_cents",
      'currency', price."currency",
      'status', price."status",
      'isPaid', price."is_paid",
      'provider', price."provider",
      'providerProductId', price."provider_product_id",
      'providerProductKey', price."provider_product_key",
      'salesCount', (
        select count(*)
        from public."money_access_ledger_events" ledger
        where ledger."creator_id" = v_actor_id
          and ledger."source_type" = 'paid_content'
          and ledger."source_id" = price."content_id"
          and ledger."status" = 'sandbox_only'
      ),
      'totalRevenueCents', (
        select coalesce(sum(ledger."amount_minor"), 0)
        from public."money_access_ledger_events" ledger
        where ledger."creator_id" = v_actor_id
          and ledger."source_type" = 'paid_content'
          and ledger."source_id" = price."content_id"
          and ledger."status" = 'sandbox_only'
      ),
      'createdAt', price."created_at",
      'updatedAt', price."updated_at"
    ) order by price."updated_at" desc)
    from public."creator_content_prices" price
    left join public."videos" video on video."id" = price."content_id"
    where price."creator_id" = v_actor_id
      and price."content_type" = 'creator_video'
  ), '[]'::jsonb);
end;
$$;

create or replace function public."list_my_paid_video_transactions"(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  if v_actor_id is null then
    raise exception 'monetization_auth_required';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', ledger."id",
      'providerEventId', ledger."provider_event_id",
      'videoId', ledger."source_id",
      'videoTitle', coalesce(video."title", 'Creator video'),
      'fanId', ledger."user_id",
      'creatorId', ledger."creator_id",
      'amountCents', ledger."amount_minor",
      'currency', ledger."currency",
      'provider', coalesce(provider_event."provider", 'revenuecat_google_play'),
      'providerProductId', provider_event."metadata"->>'provider_product_id',
      'status', case
        when ledger."payable_state" = 'refunded' then 'refunded'
        when ledger."payable_state" in ('reversed', 'chargeback') then ledger."payable_state"
        when ledger."status" = 'sandbox_only' then 'paid'
        else ledger."status"
      end,
      'payoutStatus', ledger."payable_state",
      'environment', ledger."environment",
      'createdAt', ledger."created_at",
      'paidAt', ledger."created_at",
      'metadata', jsonb_build_object(
        'sandboxOnly', ledger."environment" = 'sandbox',
        'premiumUnlock', false,
        'tipsPath', false
      )
    ) order by ledger."created_at" desc)
    from (
      select *
      from public."money_access_ledger_events"
      where "creator_id" = v_actor_id
        and "source_type" = 'paid_content'
      order by "created_at" desc
      limit v_limit
    ) ledger
    left join public."videos" video on video."id" = ledger."source_id"
    left join public."provider_events" provider_event on provider_event."id" = ledger."provider_event_id"
  ), '[]'::jsonb);
end;
$$;

revoke all on function public."sync_paid_content_access_grant_bridge"() from public;
revoke all on function public."resolve_creator_content_access"(text, uuid) from public;
revoke all on function public."set_creator_content_price"(text, uuid, boolean, integer, text) from public;
revoke all on function public."list_my_paid_video_offers"() from public;
revoke all on function public."list_my_paid_video_transactions"(integer) from public;

grant execute on function public."resolve_creator_content_access"(text, uuid) to anon, authenticated;
grant execute on function public."set_creator_content_price"(text, uuid, boolean, integer, text) to authenticated;
grant execute on function public."list_my_paid_video_offers"() to authenticated;
grant execute on function public."list_my_paid_video_transactions"(integer) to authenticated;

comment on function public."set_creator_content_price"(text, uuid, boolean, integer, text) is
  'Creator-owned Paid Videos V1 setup. Saves sandbox-only RevenueCat/Google Play paid creator-video offers; does not activate live money, Tips, Premium, payouts, or access without provider verification.';

comment on function public."list_my_paid_video_transactions"(integer) is
  'Creator-safe Paid Videos V1 transaction readback from verified RevenueCat/Google Play sandbox ledger rows. Sandbox rows are not payable.';
