-- Provider-link readiness scaffold.
-- This migration creates one backend-owned provider readiness source of truth for
-- Premium, RevenueCat, Google Play Billing, Stripe/Connect, payouts, revenue,
-- tips, paid content, ads, and future commerce. It does not enable purchases,
-- checkout, balances, payouts, transfers, tips, paid content, revenue imports,
-- or live money movement.

create table if not exists public."provider_readiness_status" (
  "id" uuid primary key default gen_random_uuid(),
  "provider" text not null,
  "capability" text not null,
  "status" text not null,
  "environment" text not null default 'production',
  "proof_source" text,
  "proof_summary" text,
  "last_checked_at" timestamptz,
  "last_error_code" text,
  "last_error_message" text,
  "is_live_money_enabled" boolean not null default false,
  "is_client_visible" boolean not null default true,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "provider_readiness_status_provider_check"
    check ("provider" in (
      'revenuecat',
      'google_play',
      'stripe',
      'stripe_connect',
      'stripe_webhook',
      'ads',
      'internal_policy'
    )),
  constraint "provider_readiness_status_capability_check"
    check ("capability" in (
      'premium_entitlement',
      'google_play_subscription_product',
      'revenuecat_offering',
      'revenuecat_entitlement',
      'stripe_connect_account',
      'stripe_webhook_signature',
      'payout_setup',
      'payout_release',
      'creator_revenue_imports',
      'tips',
      'paid_content',
      'platform_commerce',
      'ad_revenue',
      'creator_monetization_policy'
    )),
  constraint "provider_readiness_status_status_check"
    check ("status" in (
      'missing',
      'setup_needed',
      'configured',
      'ready_for_review',
      'sandbox_ready',
      'active',
      'disabled',
      'blocked',
      'error'
    )),
  constraint "provider_readiness_status_environment_check"
    check ("environment" in ('production', 'sandbox', 'test', 'development')),
  constraint "provider_readiness_status_live_money_requires_active_check"
    check ("is_live_money_enabled" = false or "status" = 'active'),
  constraint "provider_readiness_status_active_requires_proof_check"
    check (
      "status" <> 'active'
      or (
        nullif(trim(coalesce("proof_source", '')), '') is not null
        and nullif(trim(coalesce("proof_summary", '')), '') is not null
        and "last_checked_at" is not null
      )
    )
);

create unique index if not exists "provider_readiness_status_provider_capability_environment_unique"
  on public."provider_readiness_status" using btree ("provider", "capability", "environment");

create index if not exists "provider_readiness_status_client_status_idx"
  on public."provider_readiness_status" using btree ("is_client_visible", "status", "provider", "capability");

create table if not exists public."provider_readiness_audit_log" (
  "id" uuid primary key default gen_random_uuid(),
  "actor_user_id" uuid,
  "provider" text,
  "capability" text,
  "action" text not null,
  "status_before" text,
  "status_after" text,
  "reason" text,
  "proof_source" text,
  "security_context_id" uuid,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "provider_readiness_audit_log_metadata_no_raw_secret_check"
    check (jsonb_typeof("metadata") = 'object')
);

create index if not exists "provider_readiness_audit_log_created_at_idx"
  on public."provider_readiness_audit_log" using btree ("created_at" desc);

create index if not exists "provider_readiness_audit_log_provider_capability_idx"
  on public."provider_readiness_audit_log" using btree ("provider", "capability", "created_at" desc);

create or replace function public."touch_provider_readiness_updated_at"()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new."updated_at" = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists "touch_provider_readiness_status_updated_at" on public."provider_readiness_status";
create trigger "touch_provider_readiness_status_updated_at"
  before update on public."provider_readiness_status"
  for each row execute function public."touch_provider_readiness_updated_at"();

create or replace function public."prevent_provider_readiness_audit_log_mutation"()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'provider_readiness_audit_log_is_append_only';
end;
$$;

drop trigger if exists "prevent_provider_readiness_audit_log_mutation" on public."provider_readiness_audit_log";
create trigger "prevent_provider_readiness_audit_log_mutation"
  before update or delete on public."provider_readiness_audit_log"
  for each row execute function public."prevent_provider_readiness_audit_log_mutation"();

alter table public."provider_readiness_status" enable row level security;
alter table public."provider_readiness_audit_log" enable row level security;

drop policy if exists "provider_readiness_status_select_owner_operator" on public."provider_readiness_status";
create policy "provider_readiness_status_select_owner_operator"
  on public."provider_readiness_status"
  for select
  to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "provider_readiness_status_insert_owner_operator" on public."provider_readiness_status";
create policy "provider_readiness_status_insert_owner_operator"
  on public."provider_readiness_status"
  for insert
  to authenticated
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "provider_readiness_status_update_owner_operator" on public."provider_readiness_status";
create policy "provider_readiness_status_update_owner_operator"
  on public."provider_readiness_status"
  for update
  to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "provider_readiness_audit_log_select_owner_operator" on public."provider_readiness_audit_log";
create policy "provider_readiness_audit_log_select_owner_operator"
  on public."provider_readiness_audit_log"
  for select
  to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "provider_readiness_audit_log_insert_owner_operator" on public."provider_readiness_audit_log";
create policy "provider_readiness_audit_log_insert_owner_operator"
  on public."provider_readiness_audit_log"
  for insert
  to authenticated
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

revoke all on table public."provider_readiness_status" from anon, authenticated;
revoke all on table public."provider_readiness_audit_log" from anon, authenticated;

grant select, insert, update on table public."provider_readiness_status" to authenticated;
grant select, insert on table public."provider_readiness_audit_log" to authenticated;
grant all on table public."provider_readiness_status" to service_role;
grant all on table public."provider_readiness_audit_log" to service_role;

create or replace function public."get_provider_readiness_summary"()
returns table (
  "provider" text,
  "capability" text,
  "status" text,
  "display_label" text,
  "display_summary" text,
  "next_step" text,
  "last_checked_at" timestamptz,
  "is_live_money_enabled" boolean,
  "public_safe" boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public."provider_readiness_audit_log" (
    "actor_user_id",
    "action",
    "reason",
    "metadata"
  )
  values (
    auth.uid(),
    'provider_readiness_summary_requested',
    'Sanitized provider readiness summary requested; no secret values returned.',
    jsonb_build_object(
      'sanitized_summary', true,
      'secret_values_returned', false,
      'live_money_enabled_by_summary', false
    )
  );

  return query
  select
    status_row."provider",
    status_row."capability",
    status_row."status",
    case status_row."status"
      when 'missing' then 'Setup needed'
      when 'setup_needed' then 'Setup needed'
      when 'configured' then 'Configured'
      when 'ready_for_review' then 'Ready for review'
      when 'sandbox_ready' then 'Sandbox ready'
      when 'active' then 'Active'
      when 'disabled' then 'Not active yet'
      when 'blocked' then 'Temporarily unavailable'
      else 'Temporarily unavailable'
    end as "display_label",
    case status_row."capability"
      when 'premium_entitlement' then 'Premium entitlement checks stay on the existing RevenueCat-backed path.'
      when 'google_play_subscription_product' then 'Google Play subscription setup is tracked for Premium readiness only.'
      when 'revenuecat_offering' then 'RevenueCat offering setup is tracked without granting access from this summary.'
      when 'revenuecat_entitlement' then 'RevenueCat entitlement setup is tracked without changing Premium gates.'
      when 'stripe_connect_account' then 'Stripe Connect account setup is tracked for future payout readiness.'
      when 'stripe_webhook_signature' then 'Stripe webhook signature readiness is tracked server-side.'
      when 'payout_setup' then 'Payout setup remains unavailable until provider, review, and policy checks are complete.'
      when 'payout_release' then 'Payout release remains disabled until a later live-money lane proves it.'
      when 'creator_revenue_imports' then 'Creator revenue imports remain disabled until a real source provider is linked.'
      when 'tips' then 'Tips remain planned until payment, policy, and provider checks are complete.'
      when 'paid_content' then 'Paid content remains planned until store/payment, refund, tax, and access checks are complete.'
      when 'platform_commerce' then 'Platform commerce remains planned until checkout, fulfillment, refund, tax, and payout checks are complete.'
      when 'ad_revenue' then 'Ad revenue remains planned until real ad reporting and payout checks are complete.'
      else 'Creator monetization policy is tracked without enabling live money.'
    end as "display_summary",
    case status_row."status"
      when 'active' then 'Keep provider proof, audit, and rollback checks current.'
      when 'sandbox_ready' then 'Run production proof before enabling any live capability.'
      when 'ready_for_review' then 'Complete owner/provider review before enabling.'
      when 'configured' then 'Run provider proof before enabling.'
      when 'disabled' then 'Link the provider and complete proof in a later lane.'
      when 'blocked' then 'Resolve the block before retrying setup.'
      when 'error' then 'Review the server-side error and retry safely.'
      else 'Add the required provider setup before review.'
    end as "next_step",
    status_row."last_checked_at",
    status_row."is_live_money_enabled",
    true as "public_safe"
  from public."provider_readiness_status" status_row
  where status_row."is_client_visible" = true
  order by
    case status_row."provider"
      when 'revenuecat' then 10
      when 'google_play' then 20
      when 'stripe' then 30
      when 'stripe_connect' then 40
      when 'stripe_webhook' then 50
      when 'ads' then 60
      else 70
    end,
    status_row."capability";
end;
$$;

revoke all on function public."get_provider_readiness_summary"() from public;
grant execute on function public."get_provider_readiness_summary"() to authenticated;
grant execute on function public."get_provider_readiness_summary"() to service_role;

insert into public."provider_readiness_status" (
  "provider",
  "capability",
  "status",
  "environment",
  "proof_source",
  "proof_summary",
  "is_live_money_enabled",
  "is_client_visible"
)
values
  ('revenuecat', 'premium_entitlement', 'configured', 'production', 'repo:premium entitlement contract', 'Premium entitlement id is documented; this row does not grant Premium.', false, true),
  ('revenuecat', 'revenuecat_offering', 'configured', 'production', 'repo:premium offering contract', 'RevenueCat offering id is documented; provider proof is still required before active claims.', false, true),
  ('revenuecat', 'revenuecat_entitlement', 'configured', 'production', 'repo:premium entitlement contract', 'RevenueCat entitlement id is documented; existing entitlement checks remain unchanged.', false, true),
  ('google_play', 'google_play_subscription_product', 'configured', 'production', 'repo:premium product contract', 'Google Play subscription product id is documented; store/provider proof remains external.', false, true),
  ('stripe', 'stripe_webhook_signature', 'setup_needed', 'production', 'repo:server-only env contract', 'Stripe webhook signing remains server-side and must be linked before live use.', false, true),
  ('stripe_connect', 'stripe_connect_account', 'setup_needed', 'production', 'repo:connect readiness scaffold', 'Stripe Connect account readiness is fail-closed and not payable.', false, true),
  ('stripe_connect', 'payout_setup', 'setup_needed', 'production', 'repo:payout readiness scaffold', 'Payout setup requires provider, KYC/tax, review, and policy proof.', false, true),
  ('stripe_connect', 'payout_release', 'disabled', 'production', 'repo:payout release disabled', 'Payout release remains disabled; no withdrawal, transfer, or payout action exists.', false, true),
  ('internal_policy', 'creator_revenue_imports', 'disabled', 'production', 'repo:source revenue import foundation', 'Revenue imports require real source provider proof and remain disabled.', false, true),
  ('stripe', 'tips', 'disabled', 'production', 'repo:tips planned only', 'Tips remain planned; no checkout or money movement exists.', false, true),
  ('google_play', 'paid_content', 'setup_needed', 'production', 'repo:paid content rail policy', 'Android digital paid content must use an approved store/payment path before activation.', false, true),
  ('stripe', 'platform_commerce', 'disabled', 'production', 'repo:commerce planned only', 'Commerce remains planned; no checkout, order, or payout action exists.', false, true),
  ('ads', 'ad_revenue', 'disabled', 'production', 'repo:ads provider-neutral foundation', 'Creator ad revenue waits for real ad reporting and payout checks.', false, true),
  ('internal_policy', 'creator_monetization_policy', 'configured', 'production', 'repo:payment rail and creator monetization policy guards', 'Internal policy guardrails are configured but do not enable live money.', false, true)
on conflict ("provider", "capability", "environment") do update
set
  "status" = excluded."status",
  "proof_source" = excluded."proof_source",
  "proof_summary" = excluded."proof_summary",
  "is_live_money_enabled" = false,
  "is_client_visible" = excluded."is_client_visible",
  "updated_at" = timezone('utc'::text, now())
where public."provider_readiness_status"."status" <> 'active';

insert into public."provider_readiness_audit_log" (
  "provider",
  "capability",
  "action",
  "status_after",
  "reason",
  "proof_source",
  "metadata"
)
select
  'internal_policy',
  'creator_monetization_policy',
  'provider_readiness_scaffold_created',
  'configured',
  'Provider-link readiness scaffold created. No live money, checkout, tips, balances, revenue imports, transfers, withdrawals, or payouts were enabled.',
  'migration:202605250002_provider_link_readiness_scaffold',
  jsonb_build_object(
    'live_money_enabled', false,
    'checkout_created', false,
    'tips_enabled', false,
    'payout_created', false,
    'transfer_created', false,
    'balance_created', false,
    'premium_granted', false,
    'secret_values_stored', false
  )
where not exists (
  select 1
  from public."provider_readiness_audit_log"
  where "action" = 'provider_readiness_scaffold_created'
    and "proof_source" = 'migration:202605250002_provider_link_readiness_scaffold'
);

comment on table public."provider_readiness_status"
  is 'Provider-link readiness state only. This table must not store secret values, provider tokens, raw webhook payloads, card data, bank data, balances, payout obligations, or live money instructions.';

comment on table public."provider_readiness_audit_log"
  is 'Append-only provider readiness audit log with sanitized metadata only. Do not store secret values or raw provider payloads.';
