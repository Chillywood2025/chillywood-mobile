alter table public."merch_products"
  add column if not exists "product_key" text,
  add column if not exists "title" text,
  add column if not exists "description" text,
  add column if not exists "image_url" text,
  add column if not exists "price_minor" integer,
  add column if not exists "currency" text not null default 'usd',
  add column if not exists "inventory_status" text not null default 'setup',
  add column if not exists "environment" text not null default 'sandbox',
  add column if not exists "stripe_price_id" text,
  add column if not exists "stripe_product_id" text,
  add column if not exists "is_physical_good" boolean not null default true,
  add column if not exists "creates_digital_access" boolean not null default false;

update public."merch_products"
set
  "title" = coalesce("title", "display_name"),
  "product_key" = coalesce("product_key", lower(regexp_replace("display_name", '[^a-zA-Z0-9]+', '_', 'g'))),
  "currency" = lower(coalesce(nullif("currency", ''), 'usd')),
  "inventory_status" = coalesce(nullif("inventory_status", ''), 'setup'),
  "environment" = coalesce(nullif("environment", ''), 'sandbox'),
  "is_physical_good" = true,
  "creates_digital_access" = false
where "title" is null
   or "product_key" is null
   or "currency" is null
   or "inventory_status" is null
   or "environment" is null
   or "is_physical_good" is distinct from true
   or "creates_digital_access" is distinct from false;

create unique index if not exists "merch_products_product_key_unique"
  on public."merch_products" ("product_key")
  where "product_key" is not null;

alter table public."merch_products"
  drop constraint if exists "merch_products_status_check",
  drop constraint if exists "merch_products_currency_check",
  drop constraint if exists "merch_products_inventory_status_check",
  drop constraint if exists "merch_products_environment_check",
  drop constraint if exists "merch_products_physical_only_check",
  drop constraint if exists "merch_products_price_check";

alter table public."merch_products"
  add constraint "merch_products_status_check"
    check ("status" in ('setup', 'sandbox', 'active', 'disabled', 'retired')),
  add constraint "merch_products_currency_check"
    check ("currency" ~ '^[a-z]{3}$'),
  add constraint "merch_products_inventory_status_check"
    check ("inventory_status" in ('setup', 'sandbox', 'in_stock', 'out_of_stock', 'disabled')),
  add constraint "merch_products_environment_check"
    check ("environment" in ('setup', 'sandbox', 'production')),
  add constraint "merch_products_physical_only_check"
    check ("is_physical_good" is true and "creates_digital_access" is false),
  add constraint "merch_products_price_check"
    check ("price_minor" is null or "price_minor" >= 0);

alter table public."merch_orders"
  add column if not exists "stripe_checkout_session_id" text,
  add column if not exists "stripe_payment_intent_id" text,
  add column if not exists "payment_status" text not null default 'pending',
  add column if not exists "amount_subtotal_minor" integer,
  add column if not exists "amount_total_minor" integer,
  add column if not exists "currency" text,
  add column if not exists "shipping_required" boolean not null default true,
  add column if not exists "shipping_name" text,
  add column if not exists "shipping_address" jsonb,
  add column if not exists "paid_at" timestamptz,
  add column if not exists "refunded_at" timestamptz,
  add column if not exists "canceled_at" timestamptz;

update public."merch_orders"
set
  "payment_status" = case
    when "order_status" = 'paid' then 'paid'
    when "order_status" = 'refunded' then 'refunded'
    when "order_status" in ('canceled', 'chargeback') then 'failed'
    else coalesce(nullif("payment_status", ''), 'pending')
  end,
  "currency" = lower(coalesce(nullif("currency", ''), 'usd'))
where "payment_status" is null
   or "currency" is null;

create unique index if not exists "merch_orders_stripe_checkout_session_unique"
  on public."merch_orders" ("stripe_checkout_session_id")
  where "stripe_checkout_session_id" is not null;

create unique index if not exists "merch_orders_stripe_payment_intent_unique"
  on public."merch_orders" ("stripe_payment_intent_id")
  where "stripe_payment_intent_id" is not null;

alter table public."merch_orders"
  drop constraint if exists "merch_orders_status_check",
  drop constraint if exists "merch_orders_payment_status_check",
  drop constraint if exists "merch_orders_fulfillment_check",
  drop constraint if exists "merch_orders_currency_check",
  drop constraint if exists "merch_orders_amount_check",
  drop constraint if exists "merch_orders_shipping_address_safe_check";

alter table public."merch_orders"
  add constraint "merch_orders_status_check"
    check ("order_status" in ('setup_only', 'pending', 'paid', 'failed', 'canceled', 'refunded', 'chargeback', 'fulfilled', 'blocked', 'test_only')),
  add constraint "merch_orders_payment_status_check"
    check ("payment_status" in ('pending', 'paid', 'failed', 'refunded', 'disputed', 'test_only')),
  add constraint "merch_orders_fulfillment_check"
    check ("fulfillment_status" in ('not_started', 'pending', 'processing', 'shipped', 'delivered', 'canceled', 'returned', 'blocked', 'test_only')),
  add constraint "merch_orders_currency_check"
    check ("currency" is null or "currency" ~ '^[a-z]{3}$'),
  add constraint "merch_orders_amount_check"
    check (
      ("amount_subtotal_minor" is null or "amount_subtotal_minor" >= 0)
      and ("amount_total_minor" is null or "amount_total_minor" >= 0)
    ),
  add constraint "merch_orders_shipping_address_safe_check"
    check (coalesce("shipping_address"::text, '') !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|card|bank)');

create table if not exists public."merch_order_items" (
  "id" uuid primary key default gen_random_uuid(),
  "order_id" uuid not null references public."merch_orders"("id") on delete cascade,
  "product_id" uuid references public."merch_products"("id") on delete set null,
  "quantity" integer not null,
  "unit_amount_minor" integer not null,
  "currency" text not null default 'usd',
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "merch_order_items_quantity_check" check ("quantity" > 0 and "quantity" <= 25),
  constraint "merch_order_items_unit_amount_check" check ("unit_amount_minor" >= 0),
  constraint "merch_order_items_currency_check" check ("currency" ~ '^[a-z]{3}$')
);

create index if not exists "merch_order_items_order_idx"
  on public."merch_order_items" ("order_id");

create index if not exists "merch_order_items_product_idx"
  on public."merch_order_items" ("product_id", "created_at" desc);

create table if not exists public."stripe_merch_events" (
  "id" uuid primary key default gen_random_uuid(),
  "stripe_event_id" text not null,
  "provider" text not null default 'stripe',
  "event_type" text not null,
  "environment" text not null default 'sandbox',
  "status" text not null default 'received',
  "object_id" text,
  "linked_order_id" uuid references public."merch_orders"("id") on delete set null,
  "processed_at" timestamptz,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "stripe_merch_events_provider_check" check ("provider" = 'stripe'),
  constraint "stripe_merch_events_environment_check" check ("environment" in ('sandbox', 'test')),
  constraint "stripe_merch_events_status_check" check ("status" in ('received', 'processed', 'ignored', 'duplicate', 'failed')),
  constraint "stripe_merch_events_metadata_safe_check"
    check ("metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|card|bank|source|client_secret)')
);

create unique index if not exists "stripe_merch_events_event_unique"
  on public."stripe_merch_events" ("stripe_event_id");

create index if not exists "stripe_merch_events_type_status_idx"
  on public."stripe_merch_events" ("event_type", "status", "created_at" desc);

create index if not exists "stripe_merch_events_order_idx"
  on public."stripe_merch_events" ("linked_order_id", "created_at" desc);

drop trigger if exists "touch_stripe_merch_events_updated_at" on public."stripe_merch_events";
create trigger "touch_stripe_merch_events_updated_at"
  before update on public."stripe_merch_events"
  for each row execute function public."touch_money_access_updated_at"();

alter table public."merch_order_items" enable row level security;
alter table public."stripe_merch_events" enable row level security;

drop policy if exists "merch_order_items_select_participant_owner_operator" on public."merch_order_items";
create policy "merch_order_items_select_participant_owner_operator"
  on public."merch_order_items" for select to authenticated
  using (
    exists (
      select 1
      from public."merch_orders" merch_order
      where merch_order."id" = "order_id"
        and (
          merch_order."buyer_id" = auth.uid()
          or merch_order."creator_id" = auth.uid()
          or public.has_platform_role(array['owner'::text, 'operator'::text])
        )
    )
  );

drop policy if exists "merch_order_items_write_owner_operator" on public."merch_order_items";
create policy "merch_order_items_write_owner_operator"
  on public."merch_order_items" for all to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "stripe_merch_events_select_owner_operator" on public."stripe_merch_events";
create policy "stripe_merch_events_select_owner_operator"
  on public."stripe_merch_events" for select to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

revoke all on table public."merch_order_items" from anon, authenticated;
revoke all on table public."stripe_merch_events" from anon, authenticated;
grant select on table public."merch_order_items" to authenticated;
grant select on table public."stripe_merch_events" to authenticated;
grant all on table public."merch_order_items" to service_role;
grant all on table public."stripe_merch_events" to service_role;

insert into public."merch_products" (
  "product_id",
  "creator_id",
  "product_key",
  "display_name",
  "title",
  "description",
  "provider",
  "status",
  "fulfillment_model",
  "price_minor",
  "currency",
  "inventory_status",
  "environment",
  "is_physical_good",
  "creates_digital_access",
  "metadata"
)
select
  product."id",
  null,
  'cw_merch_test_tee_sandbox',
  'Chi''llywood Test Tee',
  'Chi''llywood Test Tee',
  'Sandbox-only physical merch proof item. It creates no digital access and no payable balance.',
  'stripe_physical_goods',
  'sandbox',
  'manual',
  999,
  'usd',
  'sandbox',
  'sandbox',
  true,
  false,
  jsonb_build_object(
    'sandbox_only', true,
    'physical_goods_only', true,
    'creates_digital_access', false,
    'revenuecat_entitlement_created', false,
    'premium_entitlement_created', false,
    'not_payable', true,
    'fulfillment', 'manual_test_only'
  )
from public."monetization_products" product
where product."product_key" = 'merch_physical_good_setup'
on conflict ("product_key") where "product_key" is not null do update
set
  "display_name" = excluded."display_name",
  "title" = excluded."title",
  "description" = excluded."description",
  "provider" = 'stripe_physical_goods',
  "status" = 'sandbox',
  "fulfillment_model" = 'manual',
  "price_minor" = 999,
  "currency" = 'usd',
  "inventory_status" = 'sandbox',
  "environment" = 'sandbox',
  "is_physical_good" = true,
  "creates_digital_access" = false,
  "metadata" = excluded."metadata",
  "updated_at" = timezone('utc'::text, now());

comment on table public."merch_order_items" is
  'Physical merch order line items. They are not Android digital goods and cannot create app access.';

comment on table public."stripe_merch_events" is
  'Sanitized Stripe sandbox physical-merch webhook events. Events are idempotent and do not create access grants, RevenueCat entitlements, payouts, or payable balances.';

comment on column public."merch_products"."creates_digital_access" is
  'Must stay false. Physical merch cannot unlock Premium, content, rooms, tips, event passes, LiveKit authority, or other digital access.';

comment on column public."merch_orders"."shipping_address" is
  'Shipping address is restricted to buyer/creator/admin-safe contexts and must not include provider secrets or payment credentials.';
