alter table public."creator_payout_accounts"
  add column if not exists "provider_environment" text default 'test'::text not null,
  add column if not exists "provider_account_type" text default 'not_configured'::text not null,
  add column if not exists "provider_dashboard_type" text default 'not_configured'::text not null,
  add column if not exists "provider_configuration_key" text,
  add column if not exists "provider_requirements_collection" text default 'not_configured'::text not null,
  add column if not exists "provider_losses_collector" text default 'not_configured'::text not null,
  add column if not exists "provider_fees_payer" text default 'not_configured'::text not null,
  add column if not exists "transfers_capability_status" text default 'not_requested'::text not null,
  add column if not exists "card_payments_capability_status" text default 'not_requested'::text not null,
  add column if not exists "onboarding_status" text default 'not_active'::text not null,
  add column if not exists "kyc_status" text default 'not_connected'::text not null,
  add column if not exists "tax_status" text default 'not_connected'::text not null,
  add column if not exists "last_platform_admin_audit_log_id" uuid references public."platform_admin_audit_logs"("id") on delete set null;

alter table public."creator_payout_accounts"
  drop constraint if exists "creator_payout_accounts_provider_environment_check";

alter table public."creator_payout_accounts"
  add constraint "creator_payout_accounts_provider_environment_check"
    check ("provider_environment" in ('test', 'live', 'unknown'));

alter table public."creator_payout_accounts"
  drop constraint if exists "creator_payout_accounts_provider_account_type_check";

alter table public."creator_payout_accounts"
  add constraint "creator_payout_accounts_provider_account_type_check"
    check ("provider_account_type" in (
      'not_configured',
      'express',
      'standard',
      'custom',
      'accounts_v2_recipient',
      'unknown'
    ));

alter table public."creator_payout_accounts"
  drop constraint if exists "creator_payout_accounts_provider_dashboard_type_check";

alter table public."creator_payout_accounts"
  add constraint "creator_payout_accounts_provider_dashboard_type_check"
    check ("provider_dashboard_type" in ('not_configured', 'express', 'full', 'none', 'unknown'));

alter table public."creator_payout_accounts"
  drop constraint if exists "creator_payout_accounts_provider_controller_check";

alter table public."creator_payout_accounts"
  add constraint "creator_payout_accounts_provider_controller_check"
    check (
      "provider_requirements_collection" in ('not_configured', 'stripe', 'platform', 'unknown')
      and "provider_losses_collector" in ('not_configured', 'stripe', 'platform', 'unknown')
      and "provider_fees_payer" in ('not_configured', 'stripe', 'platform', 'unknown')
    );

alter table public."creator_payout_accounts"
  drop constraint if exists "creator_payout_accounts_capability_status_check";

alter table public."creator_payout_accounts"
  add constraint "creator_payout_accounts_capability_status_check"
    check (
      "transfers_capability_status" in ('not_requested', 'requested', 'pending', 'active', 'inactive', 'rejected', 'unknown')
      and "card_payments_capability_status" in ('not_requested', 'requested', 'pending', 'active', 'inactive', 'rejected', 'unknown')
    );

alter table public."creator_payout_accounts"
  drop constraint if exists "creator_payout_accounts_onboarding_status_check";

alter table public."creator_payout_accounts"
  add constraint "creator_payout_accounts_onboarding_status_check"
    check ("onboarding_status" in (
      'not_active',
      'setup_not_available',
      'setup_required',
      'onboarding_in_progress',
      'action_required',
      'under_review',
      'ready_for_payouts',
      'on_hold',
      'payouts_disabled',
      'completed',
      'cancelled',
      'failed'
    ));

alter table public."creator_payout_accounts"
  drop constraint if exists "creator_payout_accounts_readiness_status_check";

alter table public."creator_payout_accounts"
  add constraint "creator_payout_accounts_readiness_status_check"
    check (
      "kyc_status" in ('not_connected', 'not_required', 'required_later', 'pending', 'verified', 'failed', 'unknown')
      and "tax_status" in ('not_connected', 'not_required', 'required_later', 'pending', 'verified', 'failed', 'unknown')
    );

create index if not exists "creator_payout_accounts_environment_status_idx"
  on public."creator_payout_accounts" using btree ("provider_environment", "status", "created_at" desc);

create index if not exists "creator_payout_accounts_onboarding_status_idx"
  on public."creator_payout_accounts" using btree ("onboarding_status", "created_at" desc);

create index if not exists "creator_payout_accounts_audit_idx"
  on public."creator_payout_accounts" using btree ("last_platform_admin_audit_log_id");

alter table public."creator_payout_provider_transfers"
  add column if not exists "provider_environment" text default 'test'::text not null,
  add column if not exists "idempotency_key" text,
  add column if not exists "platform_admin_audit_log_id" uuid references public."platform_admin_audit_logs"("id") on delete set null;

alter table public."creator_payout_provider_transfers"
  drop constraint if exists "creator_payout_provider_transfers_environment_check";

alter table public."creator_payout_provider_transfers"
  add constraint "creator_payout_provider_transfers_environment_check"
    check ("provider_environment" in ('test', 'live', 'unknown'));

create unique index if not exists "creator_payout_provider_transfers_idempotency_unique"
  on public."creator_payout_provider_transfers" using btree ("provider", "provider_environment", "idempotency_key")
  where "idempotency_key" is not null;

create index if not exists "creator_payout_provider_transfers_environment_status_idx"
  on public."creator_payout_provider_transfers" using btree ("provider_environment", "status", "created_at" desc);

create index if not exists "creator_payout_provider_transfers_audit_idx"
  on public."creator_payout_provider_transfers" using btree ("platform_admin_audit_log_id");

alter table public."creator_payout_batches"
  add column if not exists "platform_admin_audit_log_id" uuid references public."platform_admin_audit_logs"("id") on delete set null;

create index if not exists "creator_payout_batches_audit_idx"
  on public."creator_payout_batches" using btree ("platform_admin_audit_log_id");

alter table public."creator_payout_holds"
  add column if not exists "platform_admin_audit_log_id" uuid references public."platform_admin_audit_logs"("id") on delete set null;

create index if not exists "creator_payout_holds_audit_idx"
  on public."creator_payout_holds" using btree ("platform_admin_audit_log_id");

alter table public."creator_payout_audit_log"
  add column if not exists "platform_admin_audit_log_id" uuid references public."platform_admin_audit_logs"("id") on delete set null;

create index if not exists "creator_payout_audit_log_platform_audit_idx"
  on public."creator_payout_audit_log" using btree ("platform_admin_audit_log_id");

create table if not exists public."creator_payout_onboarding_sessions" (
  "id" uuid primary key default gen_random_uuid(),
  "creator_user_id" text not null,
  "payout_account_id" uuid references public."creator_payout_accounts"("id") on delete set null,
  "provider" text default 'stripe_connect'::text not null,
  "provider_environment" text default 'test'::text not null,
  "provider_account_id" text,
  "status" text default 'not_active'::text not null,
  "onboarding_url_created_at" timestamp with time zone,
  "return_url" text,
  "refresh_url" text,
  "expires_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_by_user_id" text,
  "platform_admin_audit_log_id" uuid references public."platform_admin_audit_logs"("id") on delete set null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "creator_payout_onboarding_sessions_provider_check"
    check ("provider" in ('stripe_connect', 'manual', 'unknown')),
  constraint "creator_payout_onboarding_sessions_environment_check"
    check ("provider_environment" in ('test', 'live', 'unknown')),
  constraint "creator_payout_onboarding_sessions_status_check"
    check ("status" in (
      'not_active',
      'setup_not_available',
      'requested',
      'link_created',
      'onboarding_in_progress',
      'completed',
      'expired',
      'refresh_required',
      'cancelled',
      'failed'
    )),
  constraint "creator_payout_onboarding_sessions_expiry_check"
    check ("expires_at" is null or "onboarding_url_created_at" is null or "expires_at" >= "onboarding_url_created_at"),
  constraint "creator_payout_onboarding_sessions_completed_check"
    check ("completed_at" is null or "created_at" is null or "completed_at" >= "created_at")
);

create index if not exists "creator_payout_onboarding_sessions_creator_status_idx"
  on public."creator_payout_onboarding_sessions" using btree ("creator_user_id", "status", "created_at" desc);

create index if not exists "creator_payout_onboarding_sessions_account_status_idx"
  on public."creator_payout_onboarding_sessions" using btree ("payout_account_id", "status", "created_at" desc);

create index if not exists "creator_payout_onboarding_sessions_provider_account_idx"
  on public."creator_payout_onboarding_sessions" using btree ("provider", "provider_environment", "provider_account_id");

create index if not exists "creator_payout_onboarding_sessions_expires_idx"
  on public."creator_payout_onboarding_sessions" using btree ("expires_at");

create index if not exists "creator_payout_onboarding_sessions_audit_idx"
  on public."creator_payout_onboarding_sessions" using btree ("platform_admin_audit_log_id");

create table if not exists public."creator_payout_provider_webhook_events" (
  "id" uuid primary key default gen_random_uuid(),
  "provider" text default 'stripe_connect'::text not null,
  "provider_environment" text default 'test'::text not null,
  "event_id" text not null,
  "event_type" text not null,
  "provider_account_id" text,
  "connected_account_id" text,
  "livemode" boolean default false not null,
  "status" text default 'received'::text not null,
  "processed_at" timestamp with time zone,
  "failure_reason" text,
  "retry_count" integer default 0 not null,
  "idempotency_key" text,
  "platform_admin_audit_log_id" uuid references public."platform_admin_audit_logs"("id") on delete set null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "creator_payout_provider_webhook_events_provider_check"
    check ("provider" in ('stripe_connect', 'manual', 'unknown')),
  constraint "creator_payout_provider_webhook_events_environment_check"
    check ("provider_environment" in ('test', 'live', 'unknown')),
  constraint "creator_payout_provider_webhook_events_status_check"
    check ("status" in ('received', 'processed', 'ignored', 'failed', 'retry_required')),
  constraint "creator_payout_provider_webhook_events_retry_check"
    check ("retry_count" >= 0)
);

create unique index if not exists "creator_payout_provider_webhook_events_provider_event_unique"
  on public."creator_payout_provider_webhook_events" using btree ("provider", "provider_environment", "event_id");

create unique index if not exists "creator_payout_provider_webhook_events_idempotency_unique"
  on public."creator_payout_provider_webhook_events" using btree ("provider", "provider_environment", "idempotency_key")
  where "idempotency_key" is not null;

create index if not exists "creator_payout_provider_webhook_events_type_status_idx"
  on public."creator_payout_provider_webhook_events" using btree ("event_type", "status", "created_at" desc);

create index if not exists "creator_payout_provider_webhook_events_account_idx"
  on public."creator_payout_provider_webhook_events" using btree ("provider_account_id", "created_at" desc);

create index if not exists "creator_payout_provider_webhook_events_connected_account_idx"
  on public."creator_payout_provider_webhook_events" using btree ("connected_account_id", "created_at" desc);

create index if not exists "creator_payout_provider_webhook_events_audit_idx"
  on public."creator_payout_provider_webhook_events" using btree ("platform_admin_audit_log_id");

create table if not exists public."creator_payout_eligibility_records" (
  "id" uuid primary key default gen_random_uuid(),
  "creator_user_id" text not null unique,
  "payout_account_id" uuid references public."creator_payout_accounts"("id") on delete set null,
  "eligible_for_payouts" boolean default false not null,
  "eligibility_status" text default 'not_active'::text not null,
  "eligibility_reason" text,
  "minimum_payout_met" boolean default false not null,
  "fraud_hold_active" boolean default false not null,
  "tax_ready" boolean default false not null,
  "kyc_ready" boolean default false not null,
  "provider_ready" boolean default false not null,
  "admin_review_status" text default 'not_started'::text not null,
  "hold_period_cleared" boolean default false not null,
  "payout_account_ready" boolean default false not null,
  "last_evaluated_at" timestamp with time zone,
  "platform_admin_audit_log_id" uuid references public."platform_admin_audit_logs"("id") on delete set null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "creator_payout_eligibility_records_status_check"
    check ("eligibility_status" in (
      'not_active',
      'setup_not_available',
      'setup_required',
      'onboarding_in_progress',
      'action_required',
      'under_review',
      'ready_for_payouts',
      'on_hold',
      'payouts_disabled',
      'not_eligible'
    )),
  constraint "creator_payout_eligibility_records_admin_review_check"
    check ("admin_review_status" in ('not_started', 'pending_review', 'approved_later', 'rejected', 'on_hold', 'not_required'))
);

create index if not exists "creator_payout_eligibility_records_status_idx"
  on public."creator_payout_eligibility_records" using btree ("eligibility_status", "created_at" desc);

create index if not exists "creator_payout_eligibility_records_creator_status_idx"
  on public."creator_payout_eligibility_records" using btree ("creator_user_id", "eligibility_status");

create index if not exists "creator_payout_eligibility_records_account_idx"
  on public."creator_payout_eligibility_records" using btree ("payout_account_id");

create index if not exists "creator_payout_eligibility_records_audit_idx"
  on public."creator_payout_eligibility_records" using btree ("platform_admin_audit_log_id");

alter table public."creator_payout_onboarding_sessions" enable row level security;
alter table public."creator_payout_provider_webhook_events" enable row level security;
alter table public."creator_payout_eligibility_records" enable row level security;

drop policy if exists "creator_payout_onboarding_sessions_select_owner_operator" on public."creator_payout_onboarding_sessions";
create policy "creator_payout_onboarding_sessions_select_owner_operator"
  on public."creator_payout_onboarding_sessions"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_payout_onboarding_sessions_insert_owner_operator" on public."creator_payout_onboarding_sessions";
create policy "creator_payout_onboarding_sessions_insert_owner_operator"
  on public."creator_payout_onboarding_sessions"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_payout_onboarding_sessions_update_owner_operator" on public."creator_payout_onboarding_sessions";
create policy "creator_payout_onboarding_sessions_update_owner_operator"
  on public."creator_payout_onboarding_sessions"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_payout_provider_webhook_events_select_owner_operator" on public."creator_payout_provider_webhook_events";
create policy "creator_payout_provider_webhook_events_select_owner_operator"
  on public."creator_payout_provider_webhook_events"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_payout_provider_webhook_events_insert_owner_operator" on public."creator_payout_provider_webhook_events";
create policy "creator_payout_provider_webhook_events_insert_owner_operator"
  on public."creator_payout_provider_webhook_events"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_payout_provider_webhook_events_update_owner_operator" on public."creator_payout_provider_webhook_events";
create policy "creator_payout_provider_webhook_events_update_owner_operator"
  on public."creator_payout_provider_webhook_events"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_payout_eligibility_records_select_owner_operator" on public."creator_payout_eligibility_records";
create policy "creator_payout_eligibility_records_select_owner_operator"
  on public."creator_payout_eligibility_records"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_payout_eligibility_records_select_own_creator" on public."creator_payout_eligibility_records";
create policy "creator_payout_eligibility_records_select_own_creator"
  on public."creator_payout_eligibility_records"
  for select
  to "authenticated"
  using ("creator_user_id" = (auth.uid())::text);

drop policy if exists "creator_payout_eligibility_records_insert_owner_operator" on public."creator_payout_eligibility_records";
create policy "creator_payout_eligibility_records_insert_owner_operator"
  on public."creator_payout_eligibility_records"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_payout_eligibility_records_update_owner_operator" on public."creator_payout_eligibility_records";
create policy "creator_payout_eligibility_records_update_owner_operator"
  on public."creator_payout_eligibility_records"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

revoke all on table public."creator_payout_onboarding_sessions" from "anon";
revoke all on table public."creator_payout_provider_webhook_events" from "anon";
revoke all on table public."creator_payout_eligibility_records" from "anon";

grant select, insert, update on table public."creator_payout_onboarding_sessions" to "authenticated";
grant select, insert, update on table public."creator_payout_provider_webhook_events" to "authenticated";
grant select, insert, update on table public."creator_payout_eligibility_records" to "authenticated";

comment on column public."creator_payout_accounts"."metadata"
  is 'Foundation metadata only. Do not store Stripe secrets, webhook secrets, raw KYC documents, card data, bank data, or provider tokens.';

comment on column public."creator_payout_onboarding_sessions"."metadata"
  is 'Foundation metadata only. Do not store onboarding URLs long-term, Stripe secrets, webhook secrets, raw KYC documents, card data, bank data, or provider tokens.';

comment on column public."creator_payout_provider_webhook_events"."metadata"
  is 'Redacted provider event summary only. Do not store webhook signing secrets, raw secrets, raw KYC documents, card data, bank data, or provider tokens.';

comment on column public."creator_payout_eligibility_records"."metadata"
  is 'Foundation readiness metadata only. Do not store Stripe secrets, webhook secrets, raw KYC documents, card data, bank data, or provider tokens.';
