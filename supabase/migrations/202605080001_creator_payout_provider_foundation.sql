create table if not exists public."creator_payout_accounts" (
  "id" uuid primary key default gen_random_uuid(),
  "creator_user_id" text not null unique,
  "provider" text default 'stripe_connect'::text not null,
  "provider_account_id" text,
  "status" text default 'not_active'::text not null,
  "country" text,
  "default_currency" text default 'usd'::text not null,
  "charges_enabled" boolean default false not null,
  "payouts_enabled" boolean default false not null,
  "details_submitted" boolean default false not null,
  "requirements_currently_due" jsonb default '[]'::jsonb not null,
  "requirements_eventually_due" jsonb default '[]'::jsonb not null,
  "requirements_past_due" jsonb default '[]'::jsonb not null,
  "disabled_reason" text,
  "onboarding_started_at" timestamp with time zone,
  "onboarding_completed_at" timestamp with time zone,
  "last_provider_sync_at" timestamp with time zone,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "creator_payout_accounts_provider_check"
    check ("provider" in ('stripe_connect', 'manual', 'unknown')),
  constraint "creator_payout_accounts_status_check"
    check ("status" in (
      'not_active',
      'setup_required',
      'pending_kyc',
      'eligible',
      'pending_review',
      'on_hold',
      'approved',
      'processing',
      'paid',
      'failed',
      'cancelled'
    )),
  constraint "creator_payout_accounts_currency_check" check ("default_currency" ~ '^[a-z]{3}$')
);

create unique index if not exists "creator_payout_accounts_provider_account_unique"
  on public."creator_payout_accounts" using btree ("provider", "provider_account_id")
  where "provider_account_id" is not null;

create index if not exists "creator_payout_accounts_creator_status_idx"
  on public."creator_payout_accounts" using btree ("creator_user_id", "status", "created_at" desc);

create index if not exists "creator_payout_accounts_provider_status_idx"
  on public."creator_payout_accounts" using btree ("provider", "status", "created_at" desc);

create table if not exists public."creator_payout_batches" (
  "id" uuid primary key default gen_random_uuid(),
  "batch_reference" text unique,
  "status" text default 'not_active'::text not null,
  "currency" text default 'usd'::text not null,
  "total_amount_minor" bigint default 0 not null,
  "entry_count" integer default 0 not null,
  "period_start" date,
  "period_end" date,
  "approved_by_user_id" text,
  "approved_at" timestamp with time zone,
  "processed_at" timestamp with time zone,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "creator_payout_batches_status_check"
    check ("status" in (
      'not_active',
      'setup_required',
      'pending_kyc',
      'eligible',
      'pending_review',
      'on_hold',
      'approved',
      'processing',
      'paid',
      'failed',
      'cancelled'
    )),
  constraint "creator_payout_batches_amount_check" check ("total_amount_minor" >= 0),
  constraint "creator_payout_batches_entry_count_check" check ("entry_count" >= 0),
  constraint "creator_payout_batches_currency_check" check ("currency" ~ '^[a-z]{3}$'),
  constraint "creator_payout_batches_period_check"
    check ("period_start" is null or "period_end" is null or "period_end" >= "period_start")
);

create index if not exists "creator_payout_batches_status_created_idx"
  on public."creator_payout_batches" using btree ("status", "created_at" desc);

create index if not exists "creator_payout_batches_period_idx"
  on public."creator_payout_batches" using btree ("period_start", "period_end");

create table if not exists public."creator_payout_provider_transfers" (
  "id" uuid primary key default gen_random_uuid(),
  "batch_id" uuid references public."creator_payout_batches"("id") on delete set null,
  "payout_entry_id" bigint references public."creator_payout_ledger_entries"("id") on delete set null,
  "creator_user_id" text not null,
  "payout_account_id" uuid references public."creator_payout_accounts"("id") on delete set null,
  "provider" text default 'stripe_connect'::text not null,
  "provider_transfer_id" text,
  "provider_payout_id" text,
  "amount_minor" bigint default 0 not null,
  "currency" text default 'usd'::text not null,
  "status" text default 'not_active'::text not null,
  "failure_code" text,
  "failure_message" text,
  "estimated_arrival_at" timestamp with time zone,
  "provider_created_at" timestamp with time zone,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "creator_payout_provider_transfers_provider_check"
    check ("provider" in ('stripe_connect', 'manual', 'unknown')),
  constraint "creator_payout_provider_transfers_status_check"
    check ("status" in (
      'not_active',
      'setup_required',
      'pending_kyc',
      'eligible',
      'pending_review',
      'on_hold',
      'approved',
      'processing',
      'paid',
      'failed',
      'cancelled'
    )),
  constraint "creator_payout_provider_transfers_amount_check" check ("amount_minor" >= 0),
  constraint "creator_payout_provider_transfers_currency_check" check ("currency" ~ '^[a-z]{3}$')
);

create unique index if not exists "creator_payout_provider_transfers_transfer_unique"
  on public."creator_payout_provider_transfers" using btree ("provider", "provider_transfer_id")
  where "provider_transfer_id" is not null;

create index if not exists "creator_payout_provider_transfers_creator_status_idx"
  on public."creator_payout_provider_transfers" using btree ("creator_user_id", "status", "created_at" desc);

create index if not exists "creator_payout_provider_transfers_batch_status_idx"
  on public."creator_payout_provider_transfers" using btree ("batch_id", "status", "created_at" desc);

create index if not exists "creator_payout_provider_transfers_entry_idx"
  on public."creator_payout_provider_transfers" using btree ("payout_entry_id");

create table if not exists public."creator_payout_holds" (
  "id" uuid primary key default gen_random_uuid(),
  "creator_user_id" text not null,
  "payout_entry_id" bigint references public."creator_payout_ledger_entries"("id") on delete set null,
  "batch_id" uuid references public."creator_payout_batches"("id") on delete set null,
  "reason" text not null,
  "status" text default 'on_hold'::text not null,
  "hold_started_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "hold_until" timestamp with time zone,
  "released_at" timestamp with time zone,
  "created_by_user_id" text,
  "released_by_user_id" text,
  "admin_note" text,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "creator_payout_holds_status_check"
    check ("status" in (
      'not_active',
      'setup_required',
      'pending_kyc',
      'eligible',
      'pending_review',
      'on_hold',
      'approved',
      'processing',
      'paid',
      'failed',
      'cancelled'
    )),
  constraint "creator_payout_holds_release_check"
    check ("released_at" is null or "released_at" >= "hold_started_at")
);

create index if not exists "creator_payout_holds_creator_status_idx"
  on public."creator_payout_holds" using btree ("creator_user_id", "status", "created_at" desc);

create index if not exists "creator_payout_holds_entry_status_idx"
  on public."creator_payout_holds" using btree ("payout_entry_id", "status", "created_at" desc);

create index if not exists "creator_payout_holds_batch_status_idx"
  on public."creator_payout_holds" using btree ("batch_id", "status", "created_at" desc);

create table if not exists public."creator_payout_audit_log" (
  "id" uuid primary key default gen_random_uuid(),
  "actor_user_id" text,
  "actor_role" text,
  "action" text not null,
  "target_table" text not null,
  "target_id" text not null,
  "creator_user_id" text,
  "previous_status" text,
  "next_status" text,
  "reason" text,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "creator_payout_audit_log_status_check"
    check (
      ("previous_status" is null or "previous_status" in (
        'not_active',
        'setup_required',
        'pending_kyc',
        'eligible',
        'pending_review',
        'on_hold',
        'approved',
        'processing',
        'paid',
        'failed',
        'cancelled'
      ))
      and
      ("next_status" is null or "next_status" in (
        'not_active',
        'setup_required',
        'pending_kyc',
        'eligible',
        'pending_review',
        'on_hold',
        'approved',
        'processing',
        'paid',
        'failed',
        'cancelled'
      ))
    )
);

create index if not exists "creator_payout_audit_log_target_idx"
  on public."creator_payout_audit_log" using btree ("target_table", "target_id", "created_at" desc);

create index if not exists "creator_payout_audit_log_creator_idx"
  on public."creator_payout_audit_log" using btree ("creator_user_id", "created_at" desc);

create index if not exists "creator_payout_audit_log_action_idx"
  on public."creator_payout_audit_log" using btree ("action", "created_at" desc);

alter table public."creator_payout_accounts" enable row level security;
alter table public."creator_payout_batches" enable row level security;
alter table public."creator_payout_provider_transfers" enable row level security;
alter table public."creator_payout_holds" enable row level security;
alter table public."creator_payout_audit_log" enable row level security;

drop policy if exists "creator_payout_accounts_select_owner_operator" on public."creator_payout_accounts";
create policy "creator_payout_accounts_select_owner_operator"
  on public."creator_payout_accounts"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_payout_accounts_insert_owner_operator" on public."creator_payout_accounts";
create policy "creator_payout_accounts_insert_owner_operator"
  on public."creator_payout_accounts"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_payout_accounts_update_owner_operator" on public."creator_payout_accounts";
create policy "creator_payout_accounts_update_owner_operator"
  on public."creator_payout_accounts"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_payout_batches_select_owner_operator" on public."creator_payout_batches";
create policy "creator_payout_batches_select_owner_operator"
  on public."creator_payout_batches"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_payout_batches_insert_owner_operator" on public."creator_payout_batches";
create policy "creator_payout_batches_insert_owner_operator"
  on public."creator_payout_batches"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_payout_batches_update_owner_operator" on public."creator_payout_batches";
create policy "creator_payout_batches_update_owner_operator"
  on public."creator_payout_batches"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_payout_provider_transfers_select_owner_operator" on public."creator_payout_provider_transfers";
create policy "creator_payout_provider_transfers_select_owner_operator"
  on public."creator_payout_provider_transfers"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_payout_provider_transfers_insert_owner_operator" on public."creator_payout_provider_transfers";
create policy "creator_payout_provider_transfers_insert_owner_operator"
  on public."creator_payout_provider_transfers"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_payout_provider_transfers_update_owner_operator" on public."creator_payout_provider_transfers";
create policy "creator_payout_provider_transfers_update_owner_operator"
  on public."creator_payout_provider_transfers"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_payout_holds_select_owner_operator" on public."creator_payout_holds";
create policy "creator_payout_holds_select_owner_operator"
  on public."creator_payout_holds"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_payout_holds_insert_owner_operator" on public."creator_payout_holds";
create policy "creator_payout_holds_insert_owner_operator"
  on public."creator_payout_holds"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_payout_holds_update_owner_operator" on public."creator_payout_holds";
create policy "creator_payout_holds_update_owner_operator"
  on public."creator_payout_holds"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_payout_audit_log_select_owner_operator" on public."creator_payout_audit_log";
create policy "creator_payout_audit_log_select_owner_operator"
  on public."creator_payout_audit_log"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_payout_audit_log_insert_owner_operator" on public."creator_payout_audit_log";
create policy "creator_payout_audit_log_insert_owner_operator"
  on public."creator_payout_audit_log"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

grant select, insert, update on table public."creator_payout_accounts" to "authenticated";
grant select, insert, update on table public."creator_payout_batches" to "authenticated";
grant select, insert, update on table public."creator_payout_provider_transfers" to "authenticated";
grant select, insert, update on table public."creator_payout_holds" to "authenticated";
grant select, insert on table public."creator_payout_audit_log" to "authenticated";
