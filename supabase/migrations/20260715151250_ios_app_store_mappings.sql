-- Store-aware iOS commerce foundation.
--
-- This migration is additive and fail closed. It preserves every existing
-- Android / Google Play provider value, keeps Apple purchases sandbox-only,
-- and does not enable live money, payouts, cash-out, payable balances, or
-- LiveKit/room authority.

alter table public."platform_money_kill_switches"
  drop constraint if exists "platform_money_kill_switches_key_check";
alter table public."platform_money_kill_switches"
  add constraint "platform_money_kill_switches_key_check"
  check ("key" in (
    'money_center_visible',
    'digital_sales_enabled',
    'paid_content_enabled',
    'tips_enabled',
    'watch_party_tickets_enabled',
    'watch_party_seats_enabled',
    'live_watch_party_access_enabled',
    'live_watch_party_seats_enabled',
    'merch_enabled',
    'creator_balance_visible',
    'payouts_enabled',
    'stripe_connect_enabled',
    'revenuecat_google_play_enabled',
    'revenuecat_app_store_enabled',
    'provider_webhooks_enabled',
    'live_money_enabled',
    'creator_monetization_enabled',
    'creator_revenue_imports_enabled',
    'tax_kyc_collection_enabled',
    'ads_revenue_enabled',
    'sponsorships_enabled'
  ));

alter table public."platform_money_kill_switch_audit"
  drop constraint if exists "platform_money_kill_switch_audit_switch_key_check";
alter table public."platform_money_kill_switch_audit"
  add constraint "platform_money_kill_switch_audit_switch_key_check"
  check ("switch_key" in (
    'money_center_visible',
    'digital_sales_enabled',
    'paid_content_enabled',
    'tips_enabled',
    'watch_party_tickets_enabled',
    'watch_party_seats_enabled',
    'live_watch_party_access_enabled',
    'live_watch_party_seats_enabled',
    'merch_enabled',
    'creator_balance_visible',
    'payouts_enabled',
    'stripe_connect_enabled',
    'revenuecat_google_play_enabled',
    'revenuecat_app_store_enabled',
    'provider_webhooks_enabled',
    'live_money_enabled',
    'creator_monetization_enabled',
    'creator_revenue_imports_enabled',
    'tax_kyc_collection_enabled',
    'ads_revenue_enabled',
    'sponsorships_enabled'
  ));

insert into public."platform_money_kill_switches" (
  "key",
  "state",
  "display_label",
  "description",
  "reason",
  "owner_only_reason"
)
values (
  'revenuecat_app_store_enabled',
  'off',
  'RevenueCat / App Store',
  'Controls the sandbox/internal Apple App Store purchase rail independently from Google Play.',
  'Apple App Store purchases remain off until RevenueCat setup and physical sandbox proof pass.',
  'Keep off by default. Sandbox-only may be approved for bounded internal tests; public sale still requires a separate owner release decision.'
)
on conflict ("key") do update
set
  "display_label" = excluded."display_label",
  "description" = excluded."description";

-- Store-specific provider identities are additive. Existing generic and Google
-- values remain valid and unchanged.
alter table public."provider_events"
  drop constraint if exists "provider_events_provider_check";
alter table public."provider_events"
  add constraint "provider_events_provider_check"
  check ("provider" in (
    'revenuecat_google_play',
    'revenuecat_app_store',
    'google_play',
    'revenuecat',
    'stripe_connect',
    'stripe_physical_goods',
    'shopify',
    'merch_provider_later',
    'internal_setup'
  ));

alter table public."money_purchase_intents"
  drop constraint if exists "money_purchase_intents_provider_check";
alter table public."money_purchase_intents"
  add constraint "money_purchase_intents_provider_check"
  check ("provider" in (
    'revenuecat_google_play',
    'revenuecat_app_store',
    'google_play',
    'revenuecat'
  ));

-- Keep conceptual products separate from their permanent store records. The
-- existing Android rows are deliberately not rewritten or reused as Apple
-- provider mappings.
insert into public."monetization_products" (
  "product_key",
  "product_type",
  "display_name",
  "description",
  "provider",
  "environment",
  "status",
  "is_android_digital",
  "is_physical_good",
  "metadata"
)
values
  (
    'premium_subscription_store_catalog',
    'premium_subscription',
    'Chi''llywood Premium',
    'Conceptual Premium access product. Store-specific identifiers live only in monetization_product_store_mappings.',
    'internal_setup',
    'setup',
    'setup',
    false,
    false,
    jsonb_build_object(
      'conceptual_store_catalog', true,
      'live_money_enabled_at_activation', false,
      'purchase_shell_closed_by_default', true,
      'grants_room_authority', false
    )
  ),
  (
    'creator_tip_store_catalog',
    'creator_tip',
    'Creator tip',
    'Conceptual creator-support record. Tips never unlock digital access and never create payable balances while live money is off.',
    'internal_setup',
    'setup',
    'setup',
    false,
    false,
    jsonb_build_object(
      'conceptual_store_catalog', true,
      'tip_button_active', false,
      'unlocks_digital_access', false,
      'not_payable', true,
      'grants_room_authority', false
    )
  ),
  (
    'live_watch_party_seat_pass_store_catalog',
    'live_watch_party_seat_pass',
    'Watch-Party Seat Pass',
    'Conceptual finite-tier Seat Pass. A verified purchase intent may grant viewer eligibility only; room and LiveKit policy remain authoritative.',
    'internal_setup',
    'setup',
    'setup',
    false,
    false,
    jsonb_build_object(
      'conceptual_store_catalog', true,
      'buy_button_active', false,
      'viewer_only', true,
      'grants_room_authority', false,
      'host_approval_still_required', true
    )
  )
on conflict ("product_key") do update
set
  "display_name" = excluded."display_name",
  "description" = excluded."description",
  "metadata" = public."monetization_products"."metadata" || excluded."metadata",
  "updated_at" = timezone('utc'::text, now());

create table if not exists public."monetization_product_store_mappings" (
  "id" uuid primary key default gen_random_uuid(),
  "product_id" uuid not null references public."monetization_products"("id") on delete restrict,
  "concept" text not null,
  "platform" text not null,
  "store" text not null,
  "provider" text not null,
  "provider_product_id" text not null,
  "provider_base_plan_id" text,
  "apple_subscription_group" text,
  "store_product_type" text not null,
  "tier" text not null,
  "revenuecat_entitlement" text,
  "revenuecat_offering" text,
  "revenuecat_package" text,
  "reference_price_minor" integer not null,
  "reference_currency" text not null default 'usd',
  "environment" text not null default 'setup',
  "status" text not null default 'setup',
  "unlocks_digital_access" boolean not null default false,
  "grants_livekit_authority" boolean not null default false,
  "creates_payable_balance" boolean not null default false,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "monetization_store_mappings_concept_check"
    check ("concept" in ('premium', 'creator_tip', 'seat_pass')),
  constraint "monetization_store_mappings_platform_check"
    check ("platform" in ('android', 'ios')),
  constraint "monetization_store_mappings_store_check"
    check ("store" in ('google_play', 'app_store')),
  constraint "monetization_store_mappings_provider_check"
    check ("provider" in ('revenuecat_google_play', 'revenuecat_app_store')),
  constraint "monetization_store_mappings_platform_store_provider_check"
    check (
      ("platform" = 'android' and "store" = 'google_play' and "provider" = 'revenuecat_google_play')
      or
      ("platform" = 'ios' and "store" = 'app_store' and "provider" = 'revenuecat_app_store')
    ),
  constraint "monetization_store_mappings_product_type_check"
    check ("store_product_type" in (
      'consumable',
      'non_consumable',
      'non_renewing_subscription',
      'auto_renewable_subscription'
    )),
  constraint "monetization_store_mappings_environment_check"
    check ("environment" in ('setup', 'sandbox', 'production')),
  constraint "monetization_store_mappings_status_check"
    check ("status" in ('setup', 'sandbox', 'active', 'disabled', 'retired')),
  constraint "monetization_store_mappings_reference_price_check"
    check ("reference_price_minor" >= 0),
  constraint "monetization_store_mappings_reference_currency_check"
    check ("reference_currency" ~ '^[a-z]{3}$'),
  constraint "monetization_store_mappings_metadata_safe_check"
    check ("metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload|authorization)'),
  constraint "monetization_store_mappings_no_authority_check"
    check ("grants_livekit_authority" = false),
  constraint "monetization_store_mappings_no_payable_balance_check"
    check ("creates_payable_balance" = false),
  constraint "monetization_store_mappings_tip_no_access_check"
    check (
      "concept" <> 'creator_tip'
      or (
        "unlocks_digital_access" = false
        and "revenuecat_entitlement" is null
        and "store_product_type" = 'consumable'
      )
    ),
  constraint "monetization_store_mappings_subscription_shape_check"
    check (
      "store_product_type" <> 'auto_renewable_subscription'
      or (
        nullif(trim(coalesce("revenuecat_entitlement", '')), '') is not null
        and (
          "platform" <> 'ios'
          or "store" <> 'app_store'
          or nullif(trim(coalesce("apple_subscription_group", '')), '') is not null
        )
      )
    ),
  constraint "monetization_store_mappings_active_proof_check"
    check (
      "status" <> 'active'
      or (
        "environment" = 'production'
        and coalesce(("metadata"->>'provider_proof')::boolean, false) = true
        and coalesce(("metadata"->>'owner_release_approved')::boolean, false) = true
      )
    )
);

create unique index if not exists "monetization_store_mappings_provider_product_unique"
  on public."monetization_product_store_mappings" (
    "platform",
    "store",
    "provider",
    "provider_product_id",
    coalesce("provider_base_plan_id", '')
  );
create index if not exists "monetization_store_mappings_product_status_idx"
  on public."monetization_product_store_mappings" ("product_id", "platform", "status", "environment");
create index if not exists "monetization_store_mappings_lookup_idx"
  on public."monetization_product_store_mappings" ("provider", "provider_product_id", "status", "environment");

drop trigger if exists "touch_monetization_product_store_mappings_updated_at"
  on public."monetization_product_store_mappings";
create trigger "touch_monetization_product_store_mappings_updated_at"
  before update on public."monetization_product_store_mappings"
  for each row execute function public."touch_money_access_updated_at"();

alter table public."monetization_product_store_mappings" enable row level security;
revoke all on table public."monetization_product_store_mappings" from public, anon, authenticated;
grant all on table public."monetization_product_store_mappings" to service_role;

comment on table public."monetization_product_store_mappings" is
  'Server-owned store mappings. No client role can read or mutate provider mappings; Apple rows remain sandbox-only until explicit owner activation.';

with apple_catalog (
  product_key,
  concept,
  provider_product_id,
  store_product_type,
  tier,
  apple_subscription_group,
  revenuecat_entitlement,
  revenuecat_offering,
  revenuecat_package,
  reference_price_minor,
  unlocks_digital_access
) as (
  values
    ('premium_subscription_store_catalog', 'premium', 'com.chillywood.premium.monthly', 'auto_renewable_subscription', 'monthly', 'chillywood_premium', 'premium', 'default', '$rc_monthly', 499, true),
    ('premium_subscription_store_catalog', 'premium', 'com.chillywood.premium.yearly', 'auto_renewable_subscription', 'yearly', 'chillywood_premium', 'premium', 'default', '$rc_annual', 4999, true),
    ('creator_tip_store_catalog', 'creator_tip', 'com.chillywood.tip.tier1', 'consumable', 'tier1', null, null, 'creator_support', 'tip_tier_1', 99, false),
    ('creator_tip_store_catalog', 'creator_tip', 'com.chillywood.tip.tier2', 'consumable', 'tier2', null, null, 'creator_support', 'tip_tier_2', 299, false),
    ('creator_tip_store_catalog', 'creator_tip', 'com.chillywood.tip.tier3', 'consumable', 'tier3', null, null, 'creator_support', 'tip_tier_3', 499, false),
    ('creator_tip_store_catalog', 'creator_tip', 'com.chillywood.tip.tier4', 'consumable', 'tier4', null, null, 'creator_support', 'tip_tier_4', 999, false),
    ('live_watch_party_seat_pass_store_catalog', 'seat_pass', 'com.chillywood.seatpass.tier1', 'consumable', 'tier1', null, null, 'seat_passes', 'seat_pass_tier_1', 99, true),
    ('live_watch_party_seat_pass_store_catalog', 'seat_pass', 'com.chillywood.seatpass.tier2', 'consumable', 'tier2', null, null, 'seat_passes', 'seat_pass_tier_2', 299, true),
    ('live_watch_party_seat_pass_store_catalog', 'seat_pass', 'com.chillywood.seatpass.tier3', 'consumable', 'tier3', null, null, 'seat_passes', 'seat_pass_tier_3', 499, true),
    ('live_watch_party_seat_pass_store_catalog', 'seat_pass', 'com.chillywood.seatpass.tier4', 'consumable', 'tier4', null, null, 'seat_passes', 'seat_pass_tier_4', 999, true)
)
insert into public."monetization_product_store_mappings" (
  "product_id",
  "concept",
  "platform",
  "store",
  "provider",
  "provider_product_id",
  "provider_base_plan_id",
  "apple_subscription_group",
  "store_product_type",
  "tier",
  "revenuecat_entitlement",
  "revenuecat_offering",
  "revenuecat_package",
  "reference_price_minor",
  "reference_currency",
  "environment",
  "status",
  "unlocks_digital_access",
  "grants_livekit_authority",
  "creates_payable_balance",
  "metadata"
)
select
  product."id",
  catalog.concept,
  'ios',
  'app_store',
  'revenuecat_app_store',
  catalog.provider_product_id,
  null,
  catalog.apple_subscription_group,
  catalog.store_product_type,
  catalog.tier,
  catalog.revenuecat_entitlement,
  catalog.revenuecat_offering,
  catalog.revenuecat_package,
  catalog.reference_price_minor,
  'usd',
  'sandbox',
  'sandbox',
  catalog.unlocks_digital_access,
  false,
  false,
  jsonb_build_object(
    'app_store_connect_record_created', true,
    'revenuecat_imported', false,
    'sandbox_only', true,
    'not_payable', true,
    'live_money_action', false,
    'payout_ready', false,
    'grants_room_authority', false,
    'source_manifest', 'config/ios/app-store-products.json'
  )
from apple_catalog catalog
join public."monetization_products" product
  on product."product_key" = catalog.product_key
on conflict do nothing;

-- Defense-in-depth assertions make any accidental Apple seed drift fail the
-- migration rather than silently granting money or media authority.
do $$
declare
  v_mapping_count integer;
begin
  select count(*) into v_mapping_count
  from public."monetization_product_store_mappings"
  where "platform" = 'ios'
    and "store" = 'app_store'
    and "provider" = 'revenuecat_app_store'
    and "status" = 'sandbox';

  if v_mapping_count <> 10 then
    raise exception 'ios_app_store_catalog_mapping_count_mismatch';
  end if;

  if exists (
    select 1
    from public."monetization_product_store_mappings"
    where "platform" = 'ios'
      and (
        "creates_payable_balance" = true
        or "grants_livekit_authority" = true
        or ("concept" = 'creator_tip' and "unlocks_digital_access" = true)
      )
  ) then
    raise exception 'ios_app_store_catalog_authority_or_money_violation';
  end if;
end;
$$;
