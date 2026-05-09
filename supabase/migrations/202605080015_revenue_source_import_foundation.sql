create table if not exists public."creator_revenue_source_import_records" (
  "id" uuid default gen_random_uuid() not null,
  "source_type" text default 'manual_foundation'::text not null,
  "provider" text default 'manual_foundation'::text not null,
  "provider_event_id" text,
  "provider_reference" text,
  "source_period_start" date,
  "source_period_end" date,
  "currency" text default 'USD'::text not null,
  "gross_amount_cents" integer default 0 not null,
  "fee_amount_cents" integer default 0 not null,
  "net_amount_cents" integer default 0 not null,
  "status" text default 'foundation'::text not null,
  "reconciliation_status" text default 'not_started'::text not null,
  "idempotency_key" text,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "creator_revenue_source_import_records_pkey" primary key ("id"),
  constraint "creator_revenue_source_import_records_source_type_check"
    check ("source_type" in (
      'platform_served_creator_page_ad_later',
      'creator_sold_sponsor_slot_later',
      'tip_later',
      'paid_content_later',
      'network_billing_later',
      'manual_foundation',
      'revenue_import_later'
    )),
  constraint "creator_revenue_source_import_records_provider_check"
    check ("provider" in (
      'applovin_later',
      'stripe_later',
      'manual_foundation',
      'unknown'
    )),
  constraint "creator_revenue_source_import_records_status_check"
    check ("status" in (
      'foundation',
      'source_not_connected',
      'import_planned_later',
      'imported_later',
      'ignored',
      'failed_later',
      'cancelled'
    )),
  constraint "creator_revenue_source_import_records_reconciliation_check"
    check ("reconciliation_status" in (
      'not_started',
      'pending_later',
      'matched_later',
      'variance_later',
      'review_required_later',
      'ignored'
    )),
  constraint "creator_revenue_source_import_records_amount_check"
    check (
      "gross_amount_cents" >= 0
      and "fee_amount_cents" >= 0
      and "net_amount_cents" >= 0
      and "net_amount_cents" <= "gross_amount_cents"
    ),
  constraint "creator_revenue_source_import_records_currency_check"
    check ("currency" ~ '^[A-Z]{3}$'),
  constraint "creator_revenue_source_import_records_period_check"
    check (
      "source_period_start" is null
      or "source_period_end" is null
      or "source_period_end" >= "source_period_start"
    )
);

create index if not exists "creator_revenue_source_import_records_source_type_idx"
  on public."creator_revenue_source_import_records" using btree ("source_type", "created_at" desc);

create index if not exists "creator_revenue_source_import_records_provider_idx"
  on public."creator_revenue_source_import_records" using btree ("provider", "created_at" desc);

create index if not exists "creator_revenue_source_import_records_status_idx"
  on public."creator_revenue_source_import_records" using btree ("status", "created_at" desc);

create index if not exists "creator_revenue_source_import_records_reconciliation_idx"
  on public."creator_revenue_source_import_records" using btree ("reconciliation_status", "created_at" desc);

create unique index if not exists "creator_revenue_source_import_records_provider_event_uidx"
  on public."creator_revenue_source_import_records" using btree ("provider", "provider_event_id")
  where "provider_event_id" is not null;

create unique index if not exists "creator_revenue_source_import_records_idempotency_uidx"
  on public."creator_revenue_source_import_records" using btree ("idempotency_key")
  where "idempotency_key" is not null;

alter table public."creator_revenue_source_import_records" enable row level security;

drop policy if exists "creator_revenue_source_import_records_select_owner_operator"
  on public."creator_revenue_source_import_records";
create policy "creator_revenue_source_import_records_select_owner_operator"
  on public."creator_revenue_source_import_records"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_revenue_source_import_records_insert_owner_operator"
  on public."creator_revenue_source_import_records";
create policy "creator_revenue_source_import_records_insert_owner_operator"
  on public."creator_revenue_source_import_records"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_revenue_source_import_records_update_owner_operator"
  on public."creator_revenue_source_import_records";
create policy "creator_revenue_source_import_records_update_owner_operator"
  on public."creator_revenue_source_import_records"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

revoke all on table public."creator_revenue_source_import_records" from "anon";
grant select, insert, update on table public."creator_revenue_source_import_records" to "authenticated";

do $$
declare
  source_import_id uuid := 'f9152484-0244-404a-83f0-f9a2bdc77d2d';
  audit_id uuid := '1d2b4700-e428-4101-b03d-ee180683012a';
  proof_metadata jsonb := jsonb_build_object(
    'revenue_source_import_foundation_proof', true,
    'created_by', 'codex_revenue_source_import_foundation',
    'foundation_only', true,
    'source_money_exists', false,
    'creator_earnings_created', false,
    'payable_balance_created', false,
    'payout_ledger_written', false,
    'live_money_action', false,
    'provider_call_made', false,
    'provider_secret_used', false
  );
begin
  insert into public."creator_revenue_source_import_records" (
    "id",
    "source_type",
    "provider",
    "provider_reference",
    "currency",
    "gross_amount_cents",
    "fee_amount_cents",
    "net_amount_cents",
    "status",
    "reconciliation_status",
    "idempotency_key",
    "metadata"
  ) values (
    source_import_id,
    'manual_foundation',
    'manual_foundation',
    'foundation_only_no_provider_reference',
    'USD',
    0,
    0,
    0,
    'foundation',
    'not_started',
    'revenue_source_import_foundation_proof_v1',
    proof_metadata
  )
  on conflict ("id") do update set
    "source_type" = excluded."source_type",
    "provider" = excluded."provider",
    "provider_reference" = excluded."provider_reference",
    "currency" = excluded."currency",
    "gross_amount_cents" = excluded."gross_amount_cents",
    "fee_amount_cents" = excluded."fee_amount_cents",
    "net_amount_cents" = excluded."net_amount_cents",
    "status" = excluded."status",
    "reconciliation_status" = excluded."reconciliation_status",
    "idempotency_key" = excluded."idempotency_key",
    "metadata" = excluded."metadata",
    "updated_at" = timezone('utc'::text, now());

  insert into public."platform_admin_audit_logs" (
    "id",
    "actor_role",
    "action",
    "action_category",
    "target_type",
    "target_id",
    "reason",
    "metadata"
  )
  select
    audit_id,
    'foundation',
    'revenue_source_import_foundation_recorded',
    'finance',
    'creator_revenue_source_import_records',
    source_import_id::text,
    'Real source revenue import foundation proof only; no source money, creator earnings, payable balance, payout ledger entry, or provider call was created.',
    proof_metadata
  where not exists (
    select 1
    from public."platform_admin_audit_logs"
    where "id" = audit_id
  );
end $$;
