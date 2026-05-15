-- Creator monetization systems foundation.
-- This migration creates the backed control-plane records for paid creator
-- content, products, tips, immutable earnings, and payout requests. It does
-- not enable live money, does not call Stripe, and does not mark any payment
-- or payout successful from the client.

create table if not exists public."monetization_system_settings" (
  "id" boolean primary key default true,
  "premium_purchase_enabled" boolean not null default false,
  "paid_content_checkout_enabled" boolean not null default false,
  "creator_pricing_enabled" boolean not null default false,
  "tips_enabled" boolean not null default false,
  "merch_store_enabled" boolean not null default false,
  "cashout_enabled" boolean not null default false,
  "payouts_enabled" boolean not null default false,
  "stripe_connect_production_enabled" boolean not null default false,
  "live_money_enabled" boolean not null default false,
  "min_price_cents" integer not null default 99,
  "max_price_cents" integer not null default 50000,
  "scheduled_payout_fee_bps" integer not null default 0,
  "instant_cashout_fee_bps" integer not null default 150,
  "instant_cashout_fee_cap_cents" integer,
  "payout_hold_days_min" integer not null default 7,
  "payout_hold_days_max" integer not null default 30,
  "updated_by" uuid,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "monetization_system_settings_singleton_check" check ("id" = true),
  constraint "monetization_system_settings_price_check" check (
    "min_price_cents" > 0
    and "max_price_cents" >= "min_price_cents"
  ),
  constraint "monetization_system_settings_cashout_check" check (
    "scheduled_payout_fee_bps" = 0
    and "instant_cashout_fee_bps" = 150
    and "instant_cashout_fee_cap_cents" is null
  ),
  constraint "monetization_system_settings_hold_check" check (
    "payout_hold_days_min" between 7 and 30
    and "payout_hold_days_max" between "payout_hold_days_min" and 30
  )
);

insert into public."monetization_system_settings" ("id")
values (true)
on conflict ("id") do nothing;

create table if not exists public."creator_monetization_profiles" (
  "creator_id" uuid primary key,
  "is_premium_creator" boolean not null default false,
  "monetization_enabled" boolean not null default false,
  "connect_account_id" uuid references public."creator_payout_accounts"("id") on delete set null,
  "connect_status" text not null default 'not_connected',
  "payout_status" text not null default 'disabled',
  "eligibility_status" text not null default 'not_eligible',
  "age_verified" boolean not null default false,
  "strikes_count" integer not null default 0,
  "public_channel" boolean not null default false,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "creator_monetization_profiles_connect_status_check"
    check ("connect_status" in ('not_connected', 'pending', 'restricted', 'ready_test', 'ready_production')),
  constraint "creator_monetization_profiles_payout_status_check"
    check ("payout_status" in ('disabled', 'pending_setup', 'test_ready', 'production_ready', 'blocked')),
  constraint "creator_monetization_profiles_eligibility_status_check"
    check ("eligibility_status" in ('not_eligible', 'pending_review', 'eligible_later', 'blocked', 'approved')),
  constraint "creator_monetization_profiles_strikes_check" check ("strikes_count" >= 0)
);

create table if not exists public."creator_content_prices" (
  "id" uuid primary key default gen_random_uuid(),
  "creator_id" uuid not null,
  "content_type" text not null,
  "content_id" uuid not null,
  "is_paid" boolean not null default false,
  "price_cents" integer not null default 0,
  "currency" text not null default 'usd',
  "status" text not null default 'draft',
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "creator_content_prices_content_type_check"
    check ("content_type" in ('creator_video', 'profile_post', 'paid_room', 'collection', 'event', 'other')),
  constraint "creator_content_prices_status_check"
    check ("status" in ('draft', 'active', 'paused', 'archived')),
  constraint "creator_content_prices_currency_check" check ("currency" ~ '^[a-z]{3}$'),
  constraint "creator_content_prices_paid_price_check" check (
    ("is_paid" = false and "price_cents" >= 0)
    or ("is_paid" = true and "price_cents" > 0)
  ),
  constraint "creator_content_prices_unique_content" unique ("content_type", "content_id")
);

create index if not exists "creator_content_prices_creator_status_idx"
  on public."creator_content_prices" ("creator_id", "status", "updated_at" desc);

create table if not exists public."paid_content_purchases" (
  "id" uuid primary key default gen_random_uuid(),
  "buyer_id" uuid not null,
  "creator_id" uuid not null,
  "content_type" text not null,
  "content_id" uuid not null,
  "price_cents" integer not null,
  "currency" text not null default 'usd',
  "provider" text not null default 'stripe_connect',
  "provider_payment_id" text,
  "payment_status" text not null default 'created',
  "access_status" text not null default 'pending',
  "refunded_at" timestamptz,
  "charged_back_at" timestamptz,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "paid_content_purchases_content_type_check"
    check ("content_type" in ('creator_video', 'profile_post', 'paid_room', 'collection', 'event', 'other')),
  constraint "paid_content_purchases_payment_status_check"
    check ("payment_status" in ('created', 'pending', 'succeeded', 'failed', 'refunded', 'charged_back', 'canceled')),
  constraint "paid_content_purchases_access_status_check"
    check ("access_status" in ('pending', 'granted', 'revoked')),
  constraint "paid_content_purchases_amount_check" check ("price_cents" > 0),
  constraint "paid_content_purchases_currency_check" check ("currency" ~ '^[a-z]{3}$')
);

create unique index if not exists "paid_content_purchases_provider_payment_unique"
  on public."paid_content_purchases" ("provider", "provider_payment_id")
  where "provider_payment_id" is not null;

create index if not exists "paid_content_purchases_buyer_content_idx"
  on public."paid_content_purchases" ("buyer_id", "content_type", "content_id", "access_status");

create table if not exists public."content_access_grants" (
  "id" uuid primary key default gen_random_uuid(),
  "user_id" uuid not null,
  "content_type" text not null,
  "content_id" uuid not null,
  "source" text not null,
  "purchase_id" uuid references public."paid_content_purchases"("id") on delete set null,
  "active" boolean not null default true,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "revoked_at" timestamptz,
  constraint "content_access_grants_content_type_check"
    check ("content_type" in ('creator_video', 'profile_post', 'paid_room', 'collection', 'event', 'other')),
  constraint "content_access_grants_source_check"
    check ("source" in ('purchase', 'owner', 'admin', 'refund_revoked'))
);

create unique index if not exists "content_access_grants_active_unique"
  on public."content_access_grants" ("user_id", "content_type", "content_id")
  where "active" = true;

create table if not exists public."creator_products" (
  "id" uuid primary key default gen_random_uuid(),
  "creator_id" uuid not null,
  "title" text not null,
  "description" text,
  "price_cents" integer not null,
  "currency" text not null default 'usd',
  "status" text not null default 'draft',
  "product_type" text not null default 'merch',
  "image_path" text,
  "inventory_mode" text not null default 'not_tracked',
  "inventory_quantity" integer,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "creator_products_status_check" check ("status" in ('draft', 'active', 'paused', 'archived')),
  constraint "creator_products_product_type_check"
    check ("product_type" in ('merch', 'clothing', 'physical', 'digital_link', 'external')),
  constraint "creator_products_inventory_mode_check"
    check ("inventory_mode" in ('not_tracked', 'limited', 'unlimited', 'external')),
  constraint "creator_products_price_check" check ("price_cents" > 0),
  constraint "creator_products_inventory_check" check ("inventory_quantity" is null or "inventory_quantity" >= 0),
  constraint "creator_products_currency_check" check ("currency" ~ '^[a-z]{3}$')
);

create index if not exists "creator_products_creator_status_idx"
  on public."creator_products" ("creator_id", "status", "updated_at" desc);

create table if not exists public."creator_product_orders" (
  "id" uuid primary key default gen_random_uuid(),
  "buyer_id" uuid not null,
  "creator_id" uuid not null,
  "product_id" uuid references public."creator_products"("id") on delete restrict,
  "quantity" integer not null default 1,
  "price_cents" integer not null,
  "currency" text not null default 'usd',
  "provider" text not null default 'stripe_connect',
  "provider_payment_id" text,
  "order_status" text not null default 'created',
  "fulfillment_status" text not null default 'pending',
  "refund_status" text not null default 'none',
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "creator_product_orders_status_check"
    check ("order_status" in ('created', 'pending', 'paid', 'failed', 'canceled', 'refunded', 'charged_back')),
  constraint "creator_product_orders_fulfillment_check"
    check ("fulfillment_status" in ('not_required', 'pending', 'processing', 'shipped', 'delivered', 'canceled')),
  constraint "creator_product_orders_refund_check"
    check ("refund_status" in ('none', 'requested', 'refunded', 'partial', 'charged_back')),
  constraint "creator_product_orders_amount_check" check ("price_cents" > 0 and "quantity" > 0),
  constraint "creator_product_orders_currency_check" check ("currency" ~ '^[a-z]{3}$')
);

create unique index if not exists "creator_product_orders_provider_payment_unique"
  on public."creator_product_orders" ("provider", "provider_payment_id")
  where "provider_payment_id" is not null;

create table if not exists public."creator_tip_transactions" (
  "id" uuid primary key default gen_random_uuid(),
  "sender_id" uuid not null,
  "creator_id" uuid not null,
  "tip_amount_cents" integer not null,
  "service_fee_cents" integer not null default 0,
  "provider_fee_cents" integer not null default 0,
  "total_paid_cents" integer not null,
  "currency" text not null default 'usd',
  "provider" text not null default 'stripe_connect',
  "provider_payment_id" text,
  "payment_status" text not null default 'created',
  "payout_status" text not null default 'not_payable',
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "creator_tip_transactions_payment_status_check"
    check ("payment_status" in ('created', 'pending', 'succeeded', 'failed', 'refunded', 'charged_back', 'canceled')),
  constraint "creator_tip_transactions_payout_status_check"
    check ("payout_status" in ('not_payable', 'pending', 'held', 'available', 'paid', 'reversed')),
  constraint "creator_tip_transactions_amount_check" check (
    "tip_amount_cents" > 0
    and "service_fee_cents" >= 0
    and "provider_fee_cents" >= 0
    and "total_paid_cents" >= ("tip_amount_cents" + "service_fee_cents" + "provider_fee_cents")
  ),
  constraint "creator_tip_transactions_currency_check" check ("currency" ~ '^[a-z]{3}$')
);

create unique index if not exists "creator_tip_transactions_provider_payment_unique"
  on public."creator_tip_transactions" ("provider", "provider_payment_id")
  where "provider_payment_id" is not null;

create table if not exists public."creator_earnings_ledger" (
  "id" uuid primary key default gen_random_uuid(),
  "creator_id" uuid not null,
  "source_type" text not null,
  "source_id" uuid,
  "gross_amount_cents" integer not null,
  "platform_fee_cents" integer not null default 0,
  "provider_fee_cents" integer not null default 0,
  "tax_cents" integer not null default 0,
  "net_creator_amount_cents" integer not null,
  "currency" text not null default 'usd',
  "ledger_status" text not null default 'pending',
  "hold_until" timestamptz,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "creator_earnings_ledger_source_type_check"
    check ("source_type" in ('tip', 'paid_content', 'product', 'ad', 'sponsor', 'adjustment', 'refund', 'chargeback', 'payout')),
  constraint "creator_earnings_ledger_status_check"
    check ("ledger_status" in ('pending', 'held', 'available', 'paid', 'reversed')),
  constraint "creator_earnings_ledger_currency_check" check ("currency" ~ '^[a-z]{3}$')
);

create index if not exists "creator_earnings_ledger_creator_status_idx"
  on public."creator_earnings_ledger" ("creator_id", "ledger_status", "created_at" desc);

create table if not exists public."creator_payout_requests" (
  "id" uuid primary key default gen_random_uuid(),
  "creator_id" uuid not null,
  "amount_cents" integer not null,
  "currency" text not null default 'usd',
  "payout_type" text not null,
  "instant_fee_cents" integer not null default 0,
  "status" text not null default 'requested',
  "provider_payout_id" text,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "creator_payout_requests_type_check" check ("payout_type" in ('scheduled', 'instant')),
  constraint "creator_payout_requests_status_check"
    check ("status" in ('requested', 'approved', 'processing', 'paid', 'failed', 'canceled')),
  constraint "creator_payout_requests_amount_check" check ("amount_cents" > 0 and "instant_fee_cents" >= 0),
  constraint "creator_payout_requests_fee_check" check (
    ("payout_type" = 'scheduled' and "instant_fee_cents" = 0)
    or ("payout_type" = 'instant' and "instant_fee_cents" >= 1)
  ),
  constraint "creator_payout_requests_currency_check" check ("currency" ~ '^[a-z]{3}$')
);

create table if not exists public."monetization_webhook_events" (
  "id" uuid primary key default gen_random_uuid(),
  "provider" text not null,
  "event_id" text not null,
  "event_type" text not null,
  "processed_at" timestamptz,
  "idempotency_key" text not null,
  "raw_event_hash" text not null,
  "status" text not null default 'received',
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "monetization_webhook_events_status_check"
    check ("status" in ('received', 'processed', 'ignored', 'failed'))
);

create unique index if not exists "monetization_webhook_events_idempotency_unique"
  on public."monetization_webhook_events" ("provider", "idempotency_key");

create table if not exists public."monetization_audit_log" (
  "id" uuid primary key default gen_random_uuid(),
  "actor_user_id" uuid,
  "action" text not null,
  "target_type" text not null,
  "target_id" text,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now())
);

create index if not exists "monetization_audit_log_target_idx"
  on public."monetization_audit_log" ("target_type", "target_id", "created_at" desc);

create or replace function public."touch_creator_monetization_updated_at"()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new."updated_at" = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists "touch_creator_monetization_profiles_updated_at" on public."creator_monetization_profiles";
create trigger "touch_creator_monetization_profiles_updated_at"
  before update on public."creator_monetization_profiles"
  for each row execute function public."touch_creator_monetization_updated_at"();

drop trigger if exists "touch_creator_content_prices_updated_at" on public."creator_content_prices";
create trigger "touch_creator_content_prices_updated_at"
  before update on public."creator_content_prices"
  for each row execute function public."touch_creator_monetization_updated_at"();

drop trigger if exists "touch_creator_products_updated_at" on public."creator_products";
create trigger "touch_creator_products_updated_at"
  before update on public."creator_products"
  for each row execute function public."touch_creator_monetization_updated_at"();

drop trigger if exists "touch_creator_payout_requests_updated_at" on public."creator_payout_requests";
create trigger "touch_creator_payout_requests_updated_at"
  before update on public."creator_payout_requests"
  for each row execute function public."touch_creator_monetization_updated_at"();

create or replace function public."block_creator_earnings_ledger_mutation"()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'creator_earnings_ledger_is_append_only';
end;
$$;

drop trigger if exists "block_creator_earnings_ledger_update" on public."creator_earnings_ledger";
create trigger "block_creator_earnings_ledger_update"
  before update on public."creator_earnings_ledger"
  for each row execute function public."block_creator_earnings_ledger_mutation"();

drop trigger if exists "block_creator_earnings_ledger_delete" on public."creator_earnings_ledger";
create trigger "block_creator_earnings_ledger_delete"
  before delete on public."creator_earnings_ledger"
  for each row execute function public."block_creator_earnings_ledger_mutation"();

alter table public."monetization_system_settings" enable row level security;
alter table public."creator_monetization_profiles" enable row level security;
alter table public."creator_content_prices" enable row level security;
alter table public."paid_content_purchases" enable row level security;
alter table public."content_access_grants" enable row level security;
alter table public."creator_products" enable row level security;
alter table public."creator_product_orders" enable row level security;
alter table public."creator_tip_transactions" enable row level security;
alter table public."creator_earnings_ledger" enable row level security;
alter table public."creator_payout_requests" enable row level security;
alter table public."monetization_webhook_events" enable row level security;
alter table public."monetization_audit_log" enable row level security;

create policy "monetization_system_settings_select_owner_operator"
  on public."monetization_system_settings" for select to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

create policy "monetization_system_settings_update_owner"
  on public."monetization_system_settings" for update to authenticated
  using (public.has_platform_role(array['owner'::text]))
  with check (public.has_platform_role(array['owner'::text]));

create policy "creator_monetization_profiles_select_self_or_owner_operator"
  on public."creator_monetization_profiles" for select to authenticated
  using ("creator_id" = auth.uid() or public.has_platform_role(array['owner'::text, 'operator'::text]));

create policy "creator_monetization_profiles_write_owner_operator"
  on public."creator_monetization_profiles" for all to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

create policy "creator_content_prices_select_public_self_or_admin"
  on public."creator_content_prices" for select to public
  using (
    public.has_platform_role(array['owner'::text, 'operator'::text])
    or (public."creator_content_prices"."creator_id" = auth.uid())
    or (
      "status" = 'active'
      and "is_paid" = true
      and "content_type" = 'creator_video'
      and exists (
        select 1
        from public."videos" video
        where video."id" = public."creator_content_prices"."content_id"
          and video."visibility" = 'public'
          and coalesce(video."moderation_status", 'clean') in ('clean', 'reported')
      )
    )
  );

create policy "paid_content_purchases_select_buyer_creator_admin"
  on public."paid_content_purchases" for select to authenticated
  using (
    "buyer_id" = auth.uid()
    or "creator_id" = auth.uid()
    or public.has_platform_role(array['owner'::text, 'operator'::text])
  );

create policy "content_access_grants_select_self_creator_admin"
  on public."content_access_grants" for select to authenticated
  using (
    "user_id" = auth.uid()
    or public.has_platform_role(array['owner'::text, 'operator'::text])
    or exists (
      select 1
      from public."creator_content_prices" price
      where price."content_type" = public."content_access_grants"."content_type"
        and price."content_id" = public."content_access_grants"."content_id"
        and price."creator_id" = auth.uid()
    )
  );

create policy "creator_products_select_public_self_admin"
  on public."creator_products" for select to public
  using (
    "status" = 'active'
    or public."creator_products"."creator_id" = auth.uid()
    or public.has_platform_role(array['owner'::text, 'operator'::text])
  );

create policy "creator_product_orders_select_buyer_creator_admin"
  on public."creator_product_orders" for select to authenticated
  using (
    "buyer_id" = auth.uid()
    or "creator_id" = auth.uid()
    or public.has_platform_role(array['owner'::text, 'operator'::text])
  );

create policy "creator_tip_transactions_select_sender_creator_admin"
  on public."creator_tip_transactions" for select to authenticated
  using (
    "sender_id" = auth.uid()
    or "creator_id" = auth.uid()
    or public.has_platform_role(array['owner'::text, 'operator'::text])
  );

create policy "creator_earnings_ledger_select_creator_admin"
  on public."creator_earnings_ledger" for select to authenticated
  using ("creator_id" = auth.uid() or public.has_platform_role(array['owner'::text, 'operator'::text]));

create policy "creator_payout_requests_select_creator_admin"
  on public."creator_payout_requests" for select to authenticated
  using ("creator_id" = auth.uid() or public.has_platform_role(array['owner'::text, 'operator'::text]));

create policy "monetization_webhook_events_select_owner_operator"
  on public."monetization_webhook_events" for select to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

create policy "monetization_audit_log_select_owner_operator"
  on public."monetization_audit_log" for select to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

revoke all on table public."monetization_system_settings" from anon, authenticated;
revoke all on table public."creator_monetization_profiles" from anon, authenticated;
revoke all on table public."creator_content_prices" from anon, authenticated;
revoke all on table public."paid_content_purchases" from anon, authenticated;
revoke all on table public."content_access_grants" from anon, authenticated;
revoke all on table public."creator_products" from anon, authenticated;
revoke all on table public."creator_product_orders" from anon, authenticated;
revoke all on table public."creator_tip_transactions" from anon, authenticated;
revoke all on table public."creator_earnings_ledger" from anon, authenticated;
revoke all on table public."creator_payout_requests" from anon, authenticated;
revoke all on table public."monetization_webhook_events" from anon, authenticated;
revoke all on table public."monetization_audit_log" from anon, authenticated;

grant select on table public."creator_content_prices" to anon, authenticated;
grant select on table public."creator_products" to anon, authenticated;
grant select, update on table public."monetization_system_settings" to authenticated;
grant insert, update on table public."creator_monetization_profiles" to authenticated;
grant select on table public."creator_monetization_profiles" to authenticated;
grant select on table public."paid_content_purchases" to authenticated;
grant select on table public."content_access_grants" to authenticated;
grant select on table public."creator_product_orders" to authenticated;
grant select on table public."creator_tip_transactions" to authenticated;
grant select on table public."creator_earnings_ledger" to authenticated;
grant select on table public."creator_payout_requests" to authenticated;
grant select on table public."monetization_webhook_events" to authenticated;
grant select on table public."monetization_audit_log" to authenticated;

grant all on table public."monetization_system_settings" to service_role;
grant all on table public."creator_monetization_profiles" to service_role;
grant all on table public."creator_content_prices" to service_role;
grant all on table public."paid_content_purchases" to service_role;
grant all on table public."content_access_grants" to service_role;
grant all on table public."creator_products" to service_role;
grant all on table public."creator_product_orders" to service_role;
grant all on table public."creator_tip_transactions" to service_role;
grant all on table public."creator_earnings_ledger" to service_role;
grant all on table public."creator_payout_requests" to service_role;
grant all on table public."monetization_webhook_events" to service_role;
grant all on table public."monetization_audit_log" to service_role;

create or replace function public."monetization_has_active_premium"(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public."user_entitlements" entitlement
    where entitlement."user_id" = p_user_id::text
      and entitlement."entitlement_key" = 'premium'
      and entitlement."status" in ('active', 'trialing', 'grace_period')
      and entitlement."revoked_at" is null
      and (
        entitlement."expires_at" is null
        or entitlement."expires_at" > timezone('utc'::text, now())
      )
  );
$$;

create or replace function public."monetization_settings_json"()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'premiumPurchaseEnabled', "premium_purchase_enabled",
    'paidContentCheckoutEnabled', "paid_content_checkout_enabled",
    'creatorPricingEnabled', "creator_pricing_enabled",
    'tipsEnabled', "tips_enabled",
    'merchStoreEnabled', "merch_store_enabled",
    'cashoutEnabled', "cashout_enabled",
    'payoutsEnabled', "payouts_enabled",
    'stripeConnectProductionEnabled', "stripe_connect_production_enabled",
    'liveMoneyEnabled', "live_money_enabled",
    'minPriceCents', "min_price_cents",
    'maxPriceCents', "max_price_cents",
    'instantCashoutFeeBps', "instant_cashout_fee_bps",
    'instantCashoutFeeCapCents', "instant_cashout_fee_cap_cents",
    'payoutHoldDaysMin', "payout_hold_days_min",
    'payoutHoldDaysMax', "payout_hold_days_max"
  )
  from public."monetization_system_settings"
  where "id" = true;
$$;

create or replace function public."monetization_write_audit"(
  p_actor_user_id uuid,
  p_action text,
  p_target_type text,
  p_target_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public."monetization_audit_log" (
    "actor_user_id",
    "action",
    "target_type",
    "target_id",
    "metadata"
  )
  values (
    p_actor_user_id,
    p_action,
    p_target_type,
    p_target_id,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

create or replace function public."calculate_creator_instant_cashout_fee"(p_amount_cents integer)
returns integer
language sql
immutable
as $$
  select greatest(0, ceiling(greatest(coalesce(p_amount_cents, 0), 0)::numeric * 0.015)::integer);
$$;

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
  v_has_grant boolean := false;
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
    and price."status" = 'active'
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
    ) into v_has_grant;
  end if;

  if v_has_grant then
    return jsonb_build_object('allowed', true, 'reason', 'purchase_grant', 'requiresPurchase', false);
  end if;

  return jsonb_build_object(
    'allowed', false,
    'reason', 'purchase_required',
    'requiresPurchase', true,
    'priceCents', v_price."price_cents",
    'currency', v_price."currency",
    'creatorId', v_creator_id
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
begin
  if v_actor_id is null then
    raise exception 'monetization_auth_required';
  end if;

  select * into v_settings from public."monetization_system_settings" where "id" = true;
  if coalesce(v_settings."creator_pricing_enabled", false) is not true then
    perform public."monetization_write_audit"(
      v_actor_id,
      'creator_pricing_blocked_disabled',
      p_content_type,
      p_content_id::text,
      jsonb_build_object('live_money_enabled', coalesce(v_settings."live_money_enabled", false))
    );
    return jsonb_build_object('status', 'blocked', 'reason', 'creator_pricing_disabled');
  end if;

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

  if not public."monetization_has_active_premium"(v_actor_id) then
    perform public."monetization_write_audit"(
      v_actor_id,
      'creator_pricing_blocked_non_premium',
      p_content_type,
      p_content_id::text
    );
    return jsonb_build_object('status', 'blocked', 'reason', 'premium_creator_required');
  end if;

  if v_currency <> 'usd' then
    raise exception 'monetization_currency_not_supported';
  end if;

  if p_is_paid and (v_price_cents < v_settings."min_price_cents" or v_price_cents > v_settings."max_price_cents") then
    raise exception 'monetization_price_out_of_range';
  end if;

  insert into public."creator_content_prices" (
    "creator_id",
    "content_type",
    "content_id",
    "is_paid",
    "price_cents",
    "currency",
    "status"
  )
  values (
    v_actor_id,
    p_content_type,
    p_content_id,
    p_is_paid,
    case when p_is_paid then v_price_cents else 0 end,
    v_currency,
    case when p_is_paid then 'active' else 'paused' end
  )
  on conflict ("content_type", "content_id")
  do update set
    "creator_id" = excluded."creator_id",
    "is_paid" = excluded."is_paid",
    "price_cents" = excluded."price_cents",
    "currency" = excluded."currency",
    "status" = excluded."status",
    "updated_at" = timezone('utc'::text, now())
  returning "id" into v_price_id;

  perform public."monetization_write_audit"(
    v_actor_id,
    'creator_content_price_set',
    p_content_type,
    p_content_id::text,
    jsonb_build_object('is_paid', p_is_paid, 'price_cents', case when p_is_paid then v_price_cents else 0 end)
  );

  return jsonb_build_object('status', 'saved', 'id', v_price_id);
end;
$$;

create or replace function public."create_creator_product_listing"(
  p_title text,
  p_description text,
  p_price_cents integer,
  p_product_type text default 'merch',
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
  v_product_id uuid;
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_product_type text := lower(trim(coalesce(p_product_type, 'merch')));
  v_currency text := lower(trim(coalesce(p_currency, 'usd')));
begin
  if v_actor_id is null then
    raise exception 'monetization_auth_required';
  end if;

  select * into v_settings from public."monetization_system_settings" where "id" = true;
  if coalesce(v_settings."merch_store_enabled", false) is not true then
    perform public."monetization_write_audit"(v_actor_id, 'product_listing_blocked_disabled', 'creator_product');
    return jsonb_build_object('status', 'blocked', 'reason', 'merch_store_disabled');
  end if;

  if not public."monetization_has_active_premium"(v_actor_id) then
    return jsonb_build_object('status', 'blocked', 'reason', 'premium_creator_required');
  end if;

  if v_title is null then
    raise exception 'monetization_product_title_required';
  end if;

  if v_product_type not in ('merch', 'clothing', 'physical', 'digital_link', 'external') then
    raise exception 'monetization_product_type_invalid';
  end if;

  if v_currency <> 'usd' then
    raise exception 'monetization_currency_not_supported';
  end if;

  if coalesce(p_price_cents, 0) < v_settings."min_price_cents" or p_price_cents > v_settings."max_price_cents" then
    raise exception 'monetization_price_out_of_range';
  end if;

  insert into public."creator_products" (
    "creator_id",
    "title",
    "description",
    "price_cents",
    "currency",
    "status",
    "product_type"
  )
  values (
    v_actor_id,
    v_title,
    nullif(trim(coalesce(p_description, '')), ''),
    p_price_cents,
    v_currency,
    'draft',
    v_product_type
  )
  returning "id" into v_product_id;

  perform public."monetization_write_audit"(v_actor_id, 'creator_product_listing_created', 'creator_product', v_product_id::text);
  return jsonb_build_object('status', 'draft_created', 'id', v_product_id);
end;
$$;

create or replace function public."calculate_creator_payout_balances"(p_creator_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_creator_id uuid := coalesce(p_creator_id, auth.uid());
  v_pending integer;
  v_held integer;
  v_available integer;
  v_paid integer;
  v_reversed integer;
begin
  if v_actor_id is null then
    raise exception 'monetization_auth_required';
  end if;

  if v_creator_id <> v_actor_id and not public.has_platform_role(array['owner'::text, 'operator'::text]) then
    raise exception 'monetization_permission_denied';
  end if;

  select
    coalesce(sum("net_creator_amount_cents") filter (where "ledger_status" = 'pending'), 0),
    coalesce(sum("net_creator_amount_cents") filter (where "ledger_status" = 'held'), 0),
    coalesce(sum("net_creator_amount_cents") filter (where "ledger_status" = 'available'), 0),
    coalesce(sum("net_creator_amount_cents") filter (where "ledger_status" = 'paid'), 0),
    coalesce(sum("net_creator_amount_cents") filter (where "ledger_status" = 'reversed'), 0)
  into v_pending, v_held, v_available, v_paid, v_reversed
  from public."creator_earnings_ledger"
  where "creator_id" = v_creator_id;

  return jsonb_build_object(
    'creatorId', v_creator_id,
    'pendingCents', v_pending,
    'heldCents', v_held,
    'availableCents', v_available,
    'paidCents', v_paid,
    'reversedCents', v_reversed
  );
end;
$$;

create or replace function public."request_creator_payout"(
  p_amount_cents integer,
  p_payout_type text default 'scheduled'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_settings public."monetization_system_settings"%rowtype;
  v_payout_type text := lower(trim(coalesce(p_payout_type, 'scheduled')));
  v_available integer;
  v_fee integer := 0;
begin
  if v_actor_id is null then
    raise exception 'monetization_auth_required';
  end if;

  select * into v_settings from public."monetization_system_settings" where "id" = true;
  if coalesce(v_settings."payouts_enabled", false) is not true
    or coalesce(v_settings."live_money_enabled", false) is not true
  then
    perform public."monetization_write_audit"(
      v_actor_id,
      'payout_request_blocked_disabled',
      'creator_payout_request',
      null,
      jsonb_build_object(
        'payouts_enabled', coalesce(v_settings."payouts_enabled", false),
        'live_money_enabled', coalesce(v_settings."live_money_enabled", false)
      )
    );
    return jsonb_build_object('status', 'blocked', 'reason', 'payouts_disabled');
  end if;

  if v_payout_type not in ('scheduled', 'instant') then
    raise exception 'monetization_payout_type_invalid';
  end if;

  if v_payout_type = 'instant' and coalesce(v_settings."cashout_enabled", false) is not true then
    return jsonb_build_object('status', 'blocked', 'reason', 'cashout_disabled');
  end if;

  select coalesce(sum("net_creator_amount_cents"), 0) into v_available
  from public."creator_earnings_ledger"
  where "creator_id" = v_actor_id
    and "ledger_status" = 'available';

  if coalesce(p_amount_cents, 0) <= 0 or p_amount_cents > v_available then
    return jsonb_build_object('status', 'blocked', 'reason', 'insufficient_available_balance');
  end if;

  if v_payout_type = 'instant' then
    v_fee := public."calculate_creator_instant_cashout_fee"(p_amount_cents);
  end if;

  insert into public."creator_payout_requests" (
    "creator_id",
    "amount_cents",
    "payout_type",
    "instant_fee_cents",
    "status"
  )
  values (
    v_actor_id,
    p_amount_cents,
    v_payout_type,
    v_fee,
    'requested'
  );

  perform public."monetization_write_audit"(
    v_actor_id,
    'creator_payout_requested',
    'creator_payout_request',
    null,
    jsonb_build_object('amount_cents', p_amount_cents, 'payout_type', v_payout_type, 'instant_fee_cents', v_fee)
  );

  return jsonb_build_object('status', 'requested', 'instantFeeCents', v_fee);
end;
$$;

create or replace function public."creator_monetization_checkout_preflight"(
  p_checkout_type text,
  p_target_id uuid default null,
  p_amount_cents integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_settings public."monetization_system_settings"%rowtype;
  v_checkout_type text := lower(trim(coalesce(p_checkout_type, '')));
  v_enabled boolean := false;
begin
  if v_actor_id is null then
    raise exception 'monetization_auth_required';
  end if;

  select * into v_settings from public."monetization_system_settings" where "id" = true;

  v_enabled := case v_checkout_type
    when 'paid_content' then coalesce(v_settings."paid_content_checkout_enabled", false)
    when 'tip' then coalesce(v_settings."tips_enabled", false)
    when 'product' then coalesce(v_settings."merch_store_enabled", false)
    else false
  end;

  if v_enabled is not true or coalesce(v_settings."live_money_enabled", false) is not true then
    perform public."monetization_write_audit"(
      v_actor_id,
      'checkout_preflight_blocked_disabled',
      coalesce(v_checkout_type, 'unknown'),
      p_target_id::text,
      jsonb_build_object(
        'amount_cents', p_amount_cents,
        'live_money_enabled', coalesce(v_settings."live_money_enabled", false)
      )
    );
    return jsonb_build_object(
      'status', 'preconditions_required',
      'reason', 'live_money_disabled',
      'checkoutType', v_checkout_type,
      'provider', 'stripe_connect_or_google_play_later'
    );
  end if;

  return jsonb_build_object(
    'status', 'preconditions_required',
    'reason', 'provider_checkout_not_wired',
    'checkoutType', v_checkout_type
  );
end;
$$;

revoke all on function public."monetization_has_active_premium"(uuid) from public;
revoke all on function public."monetization_settings_json"() from public;
revoke all on function public."calculate_creator_instant_cashout_fee"(integer) from public;
revoke all on function public."resolve_creator_content_access"(text, uuid) from public;
revoke all on function public."set_creator_content_price"(text, uuid, boolean, integer, text) from public;
revoke all on function public."create_creator_product_listing"(text, text, integer, text, text) from public;
revoke all on function public."calculate_creator_payout_balances"(uuid) from public;
revoke all on function public."request_creator_payout"(integer, text) from public;
revoke all on function public."creator_monetization_checkout_preflight"(text, uuid, integer) from public;

grant execute on function public."monetization_has_active_premium"(uuid) to authenticated;
grant execute on function public."monetization_settings_json"() to authenticated;
grant execute on function public."calculate_creator_instant_cashout_fee"(integer) to authenticated;
grant execute on function public."resolve_creator_content_access"(text, uuid) to anon, authenticated;
grant execute on function public."set_creator_content_price"(text, uuid, boolean, integer, text) to authenticated;
grant execute on function public."create_creator_product_listing"(text, text, integer, text, text) to authenticated;
grant execute on function public."calculate_creator_payout_balances"(uuid) to authenticated;
grant execute on function public."request_creator_payout"(integer, text) to authenticated;
grant execute on function public."creator_monetization_checkout_preflight"(text, uuid, integer) to authenticated;

comment on table public."monetization_system_settings" is
  'Server-backed monetization safety flags. All live-money flags default off and mobile clients cannot override them.';
comment on table public."creator_earnings_ledger" is
  'Append-only creator earnings ledger. Balances are derived from immutable rows; use adjustment/reversal rows instead of editing balances.';
comment on function public."set_creator_content_price"(text, uuid, boolean, integer, text) is
  'Creator pricing RPC. Requires authenticated owner, active Premium entitlement, server pricing flag, and supported own content.';
comment on function public."resolve_creator_content_access"(text, uuid) is
  'Paid creator-content access resolver. Free content is open, purchased content requires a backed grant, and Premium subscription alone does not unlock creator-paid content.';
comment on function public."creator_monetization_checkout_preflight"(text, uuid, integer) is
  'Checkout foundation preflight only. It never trusts client success and returns preconditions_required until provider/legal/live-money gates are enabled server-side.';
