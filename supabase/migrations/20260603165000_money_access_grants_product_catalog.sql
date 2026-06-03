-- Money access grants product catalog integration.
-- Additive readiness architecture only. This does not activate live money,
-- payout execution, paid content, tips, tickets, seats, merch checkout, or
-- LiveKit publish authority.

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
values
  ('watch_party_tickets_enabled', 'off', 'Watch-Party tickets', 'Controls paid Watch-Party Live entry ticket claims and sale controls.', 'Watch-Party tickets are not active yet.', 'Keep off until RevenueCat/Google Play products, access resolver proof, refund handling, and room policy proof pass.'),
  ('live_watch_party_access_enabled', 'off', 'Live Watch-Party access passes', 'Controls paid Live Watch-Party / Live Stage entry access pass claims and sale controls.', 'Live Watch-Party access passes are not active yet.', 'Keep off until provider mapping, room resolver proof, and policy checks pass.'),
  ('live_watch_party_seats_enabled', 'off', 'Live Watch-Party seat passes', 'Controls paid Live Watch-Party / Live Stage seat eligibility claims and sale controls.', 'Live Watch-Party seat passes are not active yet.', 'Keep off until provider mapping and host-approval/LiveKit authority proof pass.')
on conflict ("key") do update
set
  "display_label" = excluded."display_label",
  "description" = excluded."description";

create table if not exists public."monetization_products" (
  "id" uuid primary key default gen_random_uuid(),
  "product_key" text unique not null,
  "product_type" text not null,
  "display_name" text not null,
  "description" text,
  "provider" text not null,
  "provider_product_id" text,
  "provider_base_plan_id" text,
  "revenuecat_entitlement" text,
  "applies_to_type" text,
  "applies_to_id" uuid,
  "environment" text not null default 'setup',
  "status" text not null default 'setup',
  "is_android_digital" boolean not null default false,
  "is_physical_good" boolean not null default false,
  "created_by" uuid,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "monetization_products_type_check"
    check ("product_type" in (
      'premium_subscription',
      'paid_content_access',
      'watch_party_live_ticket',
      'live_watch_party_access_pass',
      'live_watch_party_seat_pass',
      'creator_tip',
      'merch_physical_good',
      'event_pass'
    )),
  constraint "monetization_products_environment_check"
    check ("environment" in ('setup', 'sandbox', 'production')),
  constraint "monetization_products_status_check"
    check ("status" in ('setup', 'sandbox', 'active', 'disabled', 'retired')),
  constraint "monetization_products_provider_check"
    check ("provider" in (
      'revenuecat_google_play',
      'google_play',
      'revenuecat',
      'stripe_physical_goods',
      'shopify',
      'merch_provider_later',
      'internal_setup'
    )),
  constraint "monetization_products_metadata_safe_check"
    check ("metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key)'),
  constraint "monetization_products_android_digital_rail_check"
    check (
      "is_android_digital" = false
      or "provider" in ('revenuecat_google_play', 'google_play', 'revenuecat')
    ),
  constraint "monetization_products_physical_good_check"
    check (
      "product_type" <> 'merch_physical_good'
      or (
        "is_physical_good" = true
        and "is_android_digital" = false
        and "provider" in ('stripe_physical_goods', 'shopify', 'merch_provider_later', 'internal_setup')
      )
    ),
  constraint "monetization_products_active_proof_check"
    check (
      "status" <> 'active'
      or (
        "environment" = 'production'
        and nullif(trim(coalesce("provider_product_id", '')), '') is not null
        and coalesce(("metadata"->>'provider_proof')::boolean, false) = true
        and coalesce(("metadata"->>'live_money_enabled_at_activation')::boolean, false) = true
      )
    )
);

create index if not exists "monetization_products_type_status_idx"
  on public."monetization_products" ("product_type", "status", "environment");

create table if not exists public."provider_events" (
  "id" uuid primary key default gen_random_uuid(),
  "provider_event_id" text not null,
  "provider" text not null,
  "product_id" uuid references public."monetization_products"("id") on delete set null,
  "product_key" text,
  "user_id" uuid,
  "app_user_id" text,
  "environment" text not null default 'setup',
  "event_type" text not null,
  "status" text not null default 'received',
  "occurred_at" timestamptz not null default timezone('utc'::text, now()),
  "idempotency_key" text not null,
  "raw_payload_hash" text,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "provider_events_environment_check"
    check ("environment" in ('setup', 'sandbox', 'production')),
  constraint "provider_events_status_check"
    check ("status" in ('received', 'processed', 'ignored', 'failed', 'refunded', 'reversed')),
  constraint "provider_events_metadata_safe_check"
    check ("metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload)'),
  constraint "provider_events_provider_check"
    check ("provider" in (
      'revenuecat_google_play',
      'google_play',
      'revenuecat',
      'stripe_connect',
      'stripe_physical_goods',
      'shopify',
      'merch_provider_later',
      'internal_setup'
    ))
);

create unique index if not exists "provider_events_idempotency_unique"
  on public."provider_events" ("provider", "idempotency_key");
create index if not exists "provider_events_product_user_idx"
  on public."provider_events" ("product_id", "user_id", "occurred_at" desc);

create table if not exists public."access_grants" (
  "id" uuid primary key default gen_random_uuid(),
  "user_id" uuid not null,
  "grant_type" text not null,
  "source_type" text not null,
  "source_id" uuid,
  "product_id" uuid references public."monetization_products"("id") on delete set null,
  "provider" text,
  "provider_event_id" uuid references public."provider_events"("id") on delete set null,
  "environment" text not null default 'setup',
  "status" text not null default 'setup_only',
  "starts_at" timestamptz not null default timezone('utc'::text, now()),
  "expires_at" timestamptz,
  "refunded_at" timestamptz,
  "revoked_at" timestamptz,
  "revoke_reason" text,
  "audit_id" uuid,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "access_grants_type_check"
    check ("grant_type" in (
      'premium',
      'paid_content_access',
      'watch_party_live_ticket',
      'live_watch_party_access_pass',
      'live_watch_party_seat_pass',
      'creator_tip_record',
      'event_pass'
    )),
  constraint "access_grants_source_type_check"
    check ("source_type" in ('provider_event', 'admin', 'entitlement_mirror', 'refund', 'revoke', 'setup')),
  constraint "access_grants_environment_check"
    check ("environment" in ('setup', 'sandbox', 'production')),
  constraint "access_grants_status_check"
    check ("status" in ('active', 'pending', 'expired', 'revoked', 'refunded', 'blocked', 'sandbox_only', 'setup_only')),
  constraint "access_grants_metadata_safe_check"
    check ("metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|livekit|publish|host_controls|admin_power)'),
  constraint "access_grants_no_authority_check"
    check (coalesce(("metadata"->>'grants_livekit_publish')::boolean, false) = false
      and coalesce(("metadata"->>'grants_host_power')::boolean, false) = false
      and coalesce(("metadata"->>'grants_admin_power')::boolean, false) = false
      and coalesce(("metadata"->>'grants_payout_access')::boolean, false) = false),
  constraint "access_grants_provider_active_check"
    check (
      "status" <> 'active'
      or "environment" <> 'production'
      or (
        "provider_event_id" is not null
        and "source_type" = 'provider_event'
      )
    ),
  constraint "access_grants_sandbox_label_check"
    check ("environment" <> 'sandbox' or "status" in ('sandbox_only', 'refunded', 'revoked', 'expired', 'blocked')),
  constraint "access_grants_setup_label_check"
    check ("environment" <> 'setup' or "status" in ('setup_only', 'revoked', 'blocked'))
);

create index if not exists "access_grants_user_type_status_idx"
  on public."access_grants" ("user_id", "grant_type", "status", "expires_at");
create index if not exists "access_grants_source_idx"
  on public."access_grants" ("grant_type", "source_id", "status");

create table if not exists public."money_access_ledger_events" (
  "id" uuid primary key default gen_random_uuid(),
  "user_id" uuid,
  "creator_id" uuid,
  "platform_id" uuid,
  "product_id" uuid references public."monetization_products"("id") on delete set null,
  "provider_event_id" uuid references public."provider_events"("id") on delete set null,
  "event_type" text not null,
  "amount_minor" integer not null default 0,
  "currency" text not null default 'usd',
  "environment" text not null default 'setup',
  "payable_state" text not null default 'not_payable',
  "status" text not null default 'setup_only',
  "source_type" text,
  "source_id" uuid,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "money_access_ledger_environment_check"
    check ("environment" in ('setup', 'sandbox', 'production')),
  constraint "money_access_ledger_payable_check"
    check ("payable_state" in ('not_payable', 'pending_verification', 'payable', 'paid', 'refunded', 'reversed', 'chargeback')),
  constraint "money_access_ledger_status_check"
    check ("status" in ('setup_only', 'sandbox_only', 'pending', 'verified', 'refunded', 'reversed', 'chargeback', 'ignored')),
  constraint "money_access_ledger_amount_check" check ("amount_minor" >= 0),
  constraint "money_access_ledger_currency_check" check ("currency" ~ '^[a-z]{3}$'),
  constraint "money_access_ledger_metadata_safe_check"
    check ("metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload)'),
  constraint "money_access_ledger_setup_not_payable_check"
    check ("environment" <> 'setup' or "payable_state" = 'not_payable'),
  constraint "money_access_ledger_sandbox_not_payable_check"
    check ("environment" <> 'sandbox' or "payable_state" in ('not_payable', 'refunded', 'reversed', 'chargeback')),
  constraint "money_access_ledger_payable_production_check"
    check ("payable_state" not in ('payable', 'paid') or "environment" = 'production'),
  constraint "money_access_ledger_payable_proof_check"
    check (
      "payable_state" not in ('payable', 'paid')
      or (
        "provider_event_id" is not null
        and coalesce(("metadata"->>'payout_readiness_proved')::boolean, false) = true
        and coalesce(("metadata"->>'live_money_enabled_at_verification')::boolean, false) = true
      )
    )
);

create index if not exists "money_access_ledger_creator_state_idx"
  on public."money_access_ledger_events" ("creator_id", "payable_state", "created_at" desc);
create index if not exists "money_access_ledger_product_idx"
  on public."money_access_ledger_events" ("product_id", "environment", "created_at" desc);

create table if not exists public."merch_products" (
  "id" uuid primary key default gen_random_uuid(),
  "product_id" uuid references public."monetization_products"("id") on delete set null,
  "creator_id" uuid,
  "display_name" text not null,
  "provider" text not null default 'merch_provider_later',
  "status" text not null default 'setup',
  "fulfillment_model" text not null default 'provider_later',
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "merch_products_status_check" check ("status" in ('setup', 'active', 'disabled', 'retired')),
  constraint "merch_products_provider_check" check ("provider" in ('stripe_physical_goods', 'shopify', 'merch_provider_later', 'internal_setup')),
  constraint "merch_products_metadata_safe_check"
    check ("metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|digital_access_grant)')
);

create table if not exists public."merch_orders" (
  "id" uuid primary key default gen_random_uuid(),
  "product_id" uuid references public."merch_products"("id") on delete set null,
  "buyer_id" uuid,
  "creator_id" uuid,
  "provider" text not null default 'merch_provider_later',
  "provider_order_id" text,
  "environment" text not null default 'setup',
  "order_status" text not null default 'setup_only',
  "fulfillment_status" text not null default 'not_started',
  "digital_access_grant_id" uuid,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "merch_orders_environment_check" check ("environment" in ('setup', 'sandbox', 'production')),
  constraint "merch_orders_status_check" check ("order_status" in ('setup_only', 'pending', 'paid', 'canceled', 'refunded', 'chargeback')),
  constraint "merch_orders_fulfillment_check" check ("fulfillment_status" in ('not_started', 'pending', 'processing', 'shipped', 'delivered', 'canceled')),
  constraint "merch_orders_no_digital_access_check" check ("digital_access_grant_id" is null),
  constraint "merch_orders_metadata_safe_check"
    check ("metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|digital_access_grant)')
);

create unique index if not exists "merch_orders_provider_unique"
  on public."merch_orders" ("provider", "provider_order_id")
  where "provider_order_id" is not null;

create or replace function public."touch_money_access_updated_at"()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new."updated_at" = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists "touch_monetization_products_updated_at" on public."monetization_products";
create trigger "touch_monetization_products_updated_at"
  before update on public."monetization_products"
  for each row execute function public."touch_money_access_updated_at"();

drop trigger if exists "touch_access_grants_updated_at" on public."access_grants";
create trigger "touch_access_grants_updated_at"
  before update on public."access_grants"
  for each row execute function public."touch_money_access_updated_at"();

drop trigger if exists "touch_merch_products_updated_at" on public."merch_products";
create trigger "touch_merch_products_updated_at"
  before update on public."merch_products"
  for each row execute function public."touch_money_access_updated_at"();

drop trigger if exists "touch_merch_orders_updated_at" on public."merch_orders";
create trigger "touch_merch_orders_updated_at"
  before update on public."merch_orders"
  for each row execute function public."touch_money_access_updated_at"();

alter table public."monetization_products" enable row level security;
alter table public."provider_events" enable row level security;
alter table public."access_grants" enable row level security;
alter table public."money_access_ledger_events" enable row level security;
alter table public."merch_products" enable row level security;
alter table public."merch_orders" enable row level security;

create policy "monetization_products_select_public_sanitized"
  on public."monetization_products" for select to authenticated
  using (true);
create policy "monetization_products_write_owner_operator"
  on public."monetization_products" for all to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

create policy "provider_events_select_owner_operator"
  on public."provider_events" for select to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));
create policy "provider_events_write_owner_operator"
  on public."provider_events" for all to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

create policy "access_grants_select_self_owner_operator"
  on public."access_grants" for select to authenticated
  using ("user_id" = auth.uid() or public.has_platform_role(array['owner'::text, 'operator'::text]));
create policy "access_grants_write_owner_operator"
  on public."access_grants" for all to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

create policy "money_access_ledger_select_self_creator_owner_operator"
  on public."money_access_ledger_events" for select to authenticated
  using (
    "user_id" = auth.uid()
    or "creator_id" = auth.uid()
    or public.has_platform_role(array['owner'::text, 'operator'::text])
  );
create policy "money_access_ledger_write_owner_operator"
  on public."money_access_ledger_events" for all to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

create policy "merch_products_select_creator_owner_operator"
  on public."merch_products" for select to authenticated
  using ("creator_id" = auth.uid() or public.has_platform_role(array['owner'::text, 'operator'::text]));
create policy "merch_products_write_owner_operator"
  on public."merch_products" for all to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

create policy "merch_orders_select_participant_owner_operator"
  on public."merch_orders" for select to authenticated
  using ("buyer_id" = auth.uid() or "creator_id" = auth.uid() or public.has_platform_role(array['owner'::text, 'operator'::text]));
create policy "merch_orders_write_owner_operator"
  on public."merch_orders" for all to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

revoke all on table public."monetization_products" from anon, authenticated;
revoke all on table public."provider_events" from anon, authenticated;
revoke all on table public."access_grants" from anon, authenticated;
revoke all on table public."money_access_ledger_events" from anon, authenticated;
revoke all on table public."merch_products" from anon, authenticated;
revoke all on table public."merch_orders" from anon, authenticated;
grant select on table public."monetization_products" to authenticated;
grant select on table public."provider_events" to authenticated;
grant select on table public."access_grants" to authenticated;
grant select on table public."money_access_ledger_events" to authenticated;
grant select on table public."merch_products" to authenticated;
grant select on table public."merch_orders" to authenticated;
grant all on table public."monetization_products" to service_role;
grant all on table public."provider_events" to service_role;
grant all on table public."access_grants" to service_role;
grant all on table public."money_access_ledger_events" to service_role;
grant all on table public."merch_products" to service_role;
grant all on table public."merch_orders" to service_role;

create or replace function public."has_premium_access"(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public."user_entitlements" entitlement
    where entitlement."user_id" = coalesce(p_user_id, auth.uid())::text
      and entitlement."entitlement_key" = 'premium'
      and entitlement."status" in ('active', 'trialing', 'grace_period')
      and entitlement."revoked_at" is null
      and (entitlement."expires_at" is null or entitlement."expires_at" > timezone('utc'::text, now()))
  );
$$;

create or replace function public."has_access_grant"(
  p_grant_type text,
  p_source_id uuid,
  p_user_id uuid default auth.uid()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := coalesce(p_user_id, auth.uid());
  v_has_grant boolean := false;
  v_status text := 'missing';
begin
  if v_user_id is null then
    return jsonb_build_object('allowed', false, 'status', 'missing', 'reason', 'auth_required');
  end if;

  select true, grant_row."status" into v_has_grant, v_status
  from public."access_grants" grant_row
  where grant_row."user_id" = v_user_id
    and grant_row."grant_type" = p_grant_type
    and (p_source_id is null or grant_row."source_id" = p_source_id)
    and grant_row."status" = 'active'
    and grant_row."environment" = 'production'
    and grant_row."starts_at" <= timezone('utc'::text, now())
    and (grant_row."expires_at" is null or grant_row."expires_at" > timezone('utc'::text, now()))
    and grant_row."refunded_at" is null
    and grant_row."revoked_at" is null
  order by grant_row."created_at" desc
  limit 1;

  if v_has_grant then
    return jsonb_build_object('allowed', true, 'status', v_status, 'reason', 'active_grant');
  end if;

  return jsonb_build_object('allowed', false, 'status', coalesce(v_status, 'missing'), 'reason', 'grant_required');
end;
$$;

create or replace function public."has_paid_content_access"(p_user_id uuid, p_content_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_video public."videos"%rowtype;
  v_access jsonb;
begin
  select * into v_video from public."videos" where "id" = p_content_id;
  if v_video."id" is null then
    return jsonb_build_object('allowed', false, 'status', 'missing', 'reason', 'content_unavailable');
  end if;
  if v_video."owner_id" = p_user_id or public.has_platform_role(array['owner'::text, 'operator'::text]) then
    return jsonb_build_object('allowed', true, 'status', 'owner_or_admin', 'reason', 'owner_or_admin_preview');
  end if;
  if v_video."visibility" <> 'public'
    or coalesce(v_video."moderation_status", 'clean') not in ('clean', 'reported')
    or v_video."quarantined_at" is not null
    or coalesce(v_video."scan_status", 'clean') in ('infected', 'malware_detected', 'blocked')
  then
    return jsonb_build_object('allowed', false, 'status', 'blocked', 'reason', 'content_policy_blocked');
  end if;

  v_access := public."has_access_grant"('paid_content_access', p_content_id, p_user_id);
  if (v_access->>'allowed')::boolean then
    return v_access;
  end if;

  return jsonb_build_object('allowed', false, 'status', 'setup_needed', 'reason', 'This content is not available for purchase yet.');
end;
$$;

create or replace function public."has_watch_party_live_ticket"(p_user_id uuid, p_party_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public."has_access_grant"('watch_party_live_ticket', p_party_id, p_user_id);
$$;

create or replace function public."has_live_watch_party_access"(p_user_id uuid, p_party_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public."has_access_grant"('live_watch_party_access_pass', p_party_id, p_user_id);
$$;

create or replace function public."has_live_watch_party_seat_eligibility"(p_user_id uuid, p_party_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public."has_access_grant"('live_watch_party_seat_pass', p_party_id, p_user_id);
$$;

create or replace function public."resolve_money_access_room_entry"(
  p_user_id uuid,
  p_party_id uuid,
  p_required_grant_type text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_room public."watch_party_rooms"%rowtype;
  v_access jsonb;
begin
  select * into v_room from public."watch_party_rooms" where "party_id" = p_party_id::text;
  if v_room."party_id" is null then
    return jsonb_build_object('allowed', false, 'viewerOnly', true, 'canPublish', false, 'reason', 'room_unavailable');
  end if;
  if coalesce(v_room."is_active", false) is not true then
    return jsonb_build_object('allowed', false, 'viewerOnly', true, 'canPublish', false, 'reason', 'room_ended');
  end if;
  if v_room."host_user_id" = p_user_id or public.has_platform_role(array['owner'::text, 'operator'::text]) then
    return jsonb_build_object('allowed', true, 'viewerOnly', false, 'canPublish', false, 'reason', 'host_or_admin_route_policy_still_applies');
  end if;
  if p_required_grant_type is null then
    return jsonb_build_object('allowed', true, 'viewerOnly', true, 'canPublish', false, 'reason', 'free_entry');
  end if;

  v_access := public."has_access_grant"(p_required_grant_type, p_party_id, p_user_id);
  return jsonb_build_object(
    'allowed', (v_access->>'allowed')::boolean,
    'viewerOnly', true,
    'canPublish', false,
    'speakerApprovalRequired', true,
    'reason', coalesce(v_access->>'reason', 'grant_required')
  );
end;
$$;

create or replace function public."get_admin_money_access_readout"()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_platform_role(array['owner'::text, 'operator'::text]) then
    raise exception 'admin_money_access_required';
  end if;

  return jsonb_build_object(
    'productCatalogCount', (select count(*) from public."monetization_products"),
    'accessGrantCount', (select count(*) from public."access_grants"),
    'providerEventCount', (select count(*) from public."provider_events"),
    'ledgerEventCount', (select count(*) from public."money_access_ledger_events"),
    'merchProductCount', (select count(*) from public."merch_products"),
    'merchOrderCount', (select count(*) from public."merch_orders"),
    'sandboxNotPayableLedgerCount', (select count(*) from public."money_access_ledger_events" where "environment" = 'sandbox' and "payable_state" = 'not_payable'),
    'setupNotPayableLedgerCount', (select count(*) from public."money_access_ledger_events" where "environment" = 'setup' and "payable_state" = 'not_payable'),
    'payableLedgerCount', (select count(*) from public."money_access_ledger_events" where "payable_state" in ('payable', 'paid')),
    'liveMoneyEnabled', coalesce((select "state" = 'on' from public."platform_money_kill_switches" where "key" = 'live_money_enabled'), false)
  );
end;
$$;

insert into public."monetization_products" (
  "product_key",
  "product_type",
  "display_name",
  "description",
  "provider",
  "provider_product_id",
  "provider_base_plan_id",
  "revenuecat_entitlement",
  "environment",
  "status",
  "is_android_digital",
  "is_physical_good",
  "metadata"
)
values
  ('premium_subscription_monthly', 'premium_subscription', 'Chi''llwood Premium', 'RevenueCat / Google Play Premium subscription. Sandbox proved; production purchase shell remains closed by default.', 'revenuecat_google_play', 'premium_subscription', 'monthly', 'premium', 'sandbox', 'sandbox', true, false, jsonb_build_object('sandbox_proved', true, 'purchase_shell_closed_by_default', true, 'live_money_enabled_at_activation', false)),
  ('paid_content_access_setup', 'paid_content_access', 'Paid content access', 'Setup-only paid creator content access product mapping placeholder.', 'revenuecat_google_play', null, null, null, 'setup', 'setup', true, false, jsonb_build_object('setup_only', true, 'buy_button_active', false)),
  ('watch_party_live_ticket_setup', 'watch_party_live_ticket', 'Watch-Party Live ticket', 'Setup-only entry ticket; ticket grants viewing entry only, never speaker or publish authority.', 'revenuecat_google_play', null, null, null, 'setup', 'setup', true, false, jsonb_build_object('setup_only', true, 'buy_button_active', false, 'grants_livekit_publish', false, 'host_approval_still_required', true)),
  ('live_watch_party_access_pass_setup', 'live_watch_party_access_pass', 'Live Watch-Party access pass', 'Setup-only Live Watch-Party / Live Stage entry access pass.', 'revenuecat_google_play', null, null, null, 'setup', 'setup', true, false, jsonb_build_object('setup_only', true, 'buy_button_active', false, 'viewer_only', true)),
  ('live_watch_party_seat_pass_setup', 'live_watch_party_seat_pass', 'Live Watch-Party seat pass', 'Setup-only seat eligibility pass; host approval and LiveKit token rules still win.', 'revenuecat_google_play', null, null, null, 'setup', 'setup', true, false, jsonb_build_object('setup_only', true, 'buy_button_active', false, 'grants_livekit_publish', false, 'host_approval_still_required', true)),
  ('creator_tip_setup', 'creator_tip', 'Creator tip', 'Setup-only Android digital creator support product placeholder.', 'revenuecat_google_play', null, null, null, 'setup', 'setup', true, false, jsonb_build_object('setup_only', true, 'tip_button_active', false, 'not_payable', true)),
  ('merch_physical_good_setup', 'merch_physical_good', 'Physical merch', 'Physical goods readiness placeholder. Separate from Android digital access.', 'merch_provider_later', null, null, null, 'setup', 'setup', false, true, jsonb_build_object('setup_only', true, 'physical_goods_only', true, 'creates_digital_access', false)),
  ('event_pass_setup', 'event_pass', 'Digital event pass', 'Setup-only future event access pass mapping placeholder.', 'revenuecat_google_play', null, null, null, 'setup', 'setup', true, false, jsonb_build_object('setup_only', true, 'buy_button_active', false))
on conflict ("product_key") do update
set
  "display_name" = excluded."display_name",
  "description" = excluded."description",
  "metadata" = public."monetization_products"."metadata" || excluded."metadata",
  "updated_at" = timezone('utc'::text, now());

insert into public."merch_products" (
  "product_id",
  "display_name",
  "provider",
  "status",
  "fulfillment_model",
  "metadata"
)
select
  product."id",
  'Physical merch readiness',
  'merch_provider_later',
  'setup',
  'provider_later',
  jsonb_build_object('physical_goods_only', true, 'creates_digital_access', false)
from public."monetization_products" product
where product."product_key" = 'merch_physical_good_setup'
  and not exists (
    select 1 from public."merch_products" merch
    where merch."product_id" = product."id"
  );

comment on table public."monetization_products" is
  'Shared sellable product catalog for money/access readiness. Android digital products are RevenueCat/Google Play; physical merch stays separate. Status defaults setup/disabled and does not activate live money.';
comment on table public."provider_events" is
  'Sanitized provider event registry with idempotency and hashes only. Raw private provider payloads and secrets are not exposed here.';
comment on table public."access_grants" is
  'User access records created by provider/admin paths. Grants entry/viewing only when resolvers and safety policy allow; never grants LiveKit publish, host/mod/admin, payout, or balance authority.';
comment on table public."money_access_ledger_events" is
  'Readiness ledger for access/product provider events. Setup and sandbox rows are not payable; payable states require production provider and payout readiness proof.';
comment on table public."merch_products" is
  'Physical merch readiness records separate from Android digital access.';
comment on table public."merch_orders" is
  'Physical merch order readiness records. They cannot create digital access grants.';
