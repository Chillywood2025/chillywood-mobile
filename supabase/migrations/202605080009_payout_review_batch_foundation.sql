alter table public."creator_payout_batches"
  add column if not exists "batch_status" text default 'foundation'::text not null,
  add column if not exists "batch_type" text default 'manual_foundation'::text not null,
  add column if not exists "total_amount_cents" integer default 0 not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'creator_payout_batches_batch_status_check'
  ) then
    alter table public."creator_payout_batches"
      add constraint "creator_payout_batches_batch_status_check"
        check ("batch_status" in (
          'foundation',
          'draft',
          'review_later',
          'ready_later',
          'cancelled',
          'processed_later'
        ));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'creator_payout_batches_batch_type_check'
  ) then
    alter table public."creator_payout_batches"
      add constraint "creator_payout_batches_batch_type_check"
        check ("batch_type" in (
          'manual_foundation',
          'ledger_foundation',
          'review_queue_draft',
          'provider_transfer_later'
        ));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'creator_payout_batches_total_amount_cents_check'
  ) then
    alter table public."creator_payout_batches"
      add constraint "creator_payout_batches_total_amount_cents_check"
        check ("total_amount_cents" >= 0);
  end if;
end $$;

create index if not exists "creator_payout_batches_batch_status_idx"
  on public."creator_payout_batches" using btree ("batch_status", "created_at" desc);

create table if not exists public."creator_payout_review_records" (
  "id" uuid primary key default gen_random_uuid(),
  "creator_user_id" text,
  "payout_ledger_entry_id" bigint references public."creator_payout_ledger_entries"("id") on delete set null,
  "payout_account_id" uuid references public."creator_payout_accounts"("id") on delete set null,
  "review_status" text default 'foundation'::text not null,
  "review_reason" text,
  "review_notes" text,
  "risk_status" text default 'not_checked'::text not null,
  "fraud_hold_id" bigint references public."platform_fraud_holds"("id") on delete set null,
  "amount_cents" integer default 0 not null,
  "currency" text default 'USD'::text not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "creator_payout_review_records_status_check"
    check ("review_status" in (
      'foundation',
      'draft',
      'pending_review_later',
      'needs_info_later',
      'approved_later',
      'rejected_later',
      'held_later',
      'cancelled'
    )),
  constraint "creator_payout_review_records_risk_status_check"
    check ("risk_status" in (
      'not_checked',
      'foundation_only',
      'fraud_review_required_later',
      'hold_active_later',
      'cleared_later'
    )),
  constraint "creator_payout_review_records_amount_check" check ("amount_cents" >= 0),
  constraint "creator_payout_review_records_currency_check" check ("currency" ~ '^[A-Z]{3}$')
);

create index if not exists "creator_payout_review_records_creator_idx"
  on public."creator_payout_review_records" using btree ("creator_user_id");

create index if not exists "creator_payout_review_records_status_idx"
  on public."creator_payout_review_records" using btree ("review_status", "created_at" desc);

create index if not exists "creator_payout_review_records_ledger_entry_idx"
  on public."creator_payout_review_records" using btree ("payout_ledger_entry_id");

create index if not exists "creator_payout_review_records_fraud_hold_idx"
  on public."creator_payout_review_records" using btree ("fraud_hold_id");

create table if not exists public."creator_payout_review_notes" (
  "id" uuid primary key default gen_random_uuid(),
  "review_id" uuid not null references public."creator_payout_review_records"("id") on delete cascade,
  "actor_user_id" text,
  "note" text not null,
  "note_type" text default 'foundation'::text not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "creator_payout_review_notes_type_check"
    check ("note_type" in (
      'foundation',
      'manual_note',
      'fraud_note_later',
      'provider_note_later',
      'review_note_later'
    ))
);

create index if not exists "creator_payout_review_notes_review_idx"
  on public."creator_payout_review_notes" using btree ("review_id", "created_at" desc);

create table if not exists public."creator_payout_batch_items" (
  "id" uuid primary key default gen_random_uuid(),
  "batch_id" uuid not null references public."creator_payout_batches"("id") on delete cascade,
  "payout_ledger_entry_id" bigint references public."creator_payout_ledger_entries"("id") on delete set null,
  "creator_user_id" text,
  "amount_cents" integer default 0 not null,
  "currency" text default 'USD'::text not null,
  "status" text default 'foundation'::text not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "creator_payout_batch_items_status_check"
    check ("status" in ('foundation', 'draft', 'review_later', 'held_later', 'cancelled')),
  constraint "creator_payout_batch_items_amount_check" check ("amount_cents" >= 0),
  constraint "creator_payout_batch_items_currency_check" check ("currency" ~ '^[A-Z]{3}$')
);

create index if not exists "creator_payout_batch_items_batch_idx"
  on public."creator_payout_batch_items" using btree ("batch_id", "created_at" desc);

create index if not exists "creator_payout_batch_items_creator_idx"
  on public."creator_payout_batch_items" using btree ("creator_user_id");

alter table public."creator_payout_review_records" enable row level security;
alter table public."creator_payout_review_notes" enable row level security;
alter table public."creator_payout_batch_items" enable row level security;

drop policy if exists "creator_payout_review_records_select_owner_operator" on public."creator_payout_review_records";
create policy "creator_payout_review_records_select_owner_operator"
  on public."creator_payout_review_records"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_payout_review_records_insert_owner_operator" on public."creator_payout_review_records";
create policy "creator_payout_review_records_insert_owner_operator"
  on public."creator_payout_review_records"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_payout_review_records_update_owner_operator" on public."creator_payout_review_records";
create policy "creator_payout_review_records_update_owner_operator"
  on public."creator_payout_review_records"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_payout_review_notes_select_owner_operator" on public."creator_payout_review_notes";
create policy "creator_payout_review_notes_select_owner_operator"
  on public."creator_payout_review_notes"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_payout_review_notes_insert_owner_operator" on public."creator_payout_review_notes";
create policy "creator_payout_review_notes_insert_owner_operator"
  on public."creator_payout_review_notes"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_payout_batch_items_select_owner_operator" on public."creator_payout_batch_items";
create policy "creator_payout_batch_items_select_owner_operator"
  on public."creator_payout_batch_items"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_payout_batch_items_insert_owner_operator" on public."creator_payout_batch_items";
create policy "creator_payout_batch_items_insert_owner_operator"
  on public."creator_payout_batch_items"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_payout_batch_items_update_owner_operator" on public."creator_payout_batch_items";
create policy "creator_payout_batch_items_update_owner_operator"
  on public."creator_payout_batch_items"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

revoke all on table public."creator_payout_review_records" from "anon";
revoke all on table public."creator_payout_review_notes" from "anon";
revoke all on table public."creator_payout_batch_items" from "anon";

grant select, insert, update on table public."creator_payout_review_records" to "authenticated";
grant select, insert on table public."creator_payout_review_notes" to "authenticated";
grant select, insert, update on table public."creator_payout_batch_items" to "authenticated";

do $$
declare
  proof_metadata jsonb := jsonb_build_object(
    'payout_review_batch_foundation_proof', true,
    'created_by', 'codex_payout_review_batch_foundation',
    'foundation_only', true,
    'live_money_action', false
  );
  review_id uuid := '59e6c8e9-62a5-43ff-9d2a-07f3d0a3b601';
  review_note_id uuid := '589174b9-6c1a-4ea4-a64e-29daf6aa0785';
  batch_id uuid := 'c2e19cda-829c-4a4e-8a56-585e0a818d49';
  batch_item_id uuid := '3358f348-b5f3-4a08-a65e-72e957ee8d2d';
  audit_id uuid := 'e4d1b4d4-6cbd-4dc0-94c6-637b87642de2';
begin
  insert into public."creator_payout_review_records" (
    "id",
    "creator_user_id",
    "review_status",
    "review_reason",
    "review_notes",
    "risk_status",
    "amount_cents",
    "currency",
    "metadata"
  ) values (
    review_id,
    'payout_review_batch_foundation_creator',
    'foundation',
    'payout_review_batch_foundation',
    'Foundation proof row only; no payout approval, rejection, release, transfer, or payable balance is active.',
    'foundation_only',
    0,
    'USD',
    proof_metadata
  )
  on conflict ("id") do update set
    "review_status" = excluded."review_status",
    "review_reason" = excluded."review_reason",
    "review_notes" = excluded."review_notes",
    "risk_status" = excluded."risk_status",
    "amount_cents" = excluded."amount_cents",
    "metadata" = excluded."metadata",
    "updated_at" = timezone('utc'::text, now());

  insert into public."creator_payout_review_notes" (
    "id",
    "review_id",
    "actor_user_id",
    "note",
    "note_type",
    "metadata"
  ) values (
    review_note_id,
    review_id,
    null,
    'Foundation proof note only; payout review actions are not active.',
    'foundation',
    proof_metadata
  )
  on conflict ("id") do update set
    "note" = excluded."note",
    "note_type" = excluded."note_type",
    "metadata" = excluded."metadata";

  insert into public."creator_payout_batches" (
    "id",
    "batch_reference",
    "status",
    "batch_status",
    "batch_type",
    "currency",
    "total_amount_minor",
    "total_amount_cents",
    "entry_count",
    "metadata"
  ) values (
    batch_id,
    'payout_review_batch_foundation_proof',
    'not_active',
    'foundation',
    'manual_foundation',
    'usd',
    0,
    0,
    1,
    proof_metadata
  )
  on conflict ("id") do update set
    "status" = excluded."status",
    "batch_status" = excluded."batch_status",
    "batch_type" = excluded."batch_type",
    "total_amount_minor" = excluded."total_amount_minor",
    "total_amount_cents" = excluded."total_amount_cents",
    "entry_count" = excluded."entry_count",
    "metadata" = excluded."metadata",
    "updated_at" = timezone('utc'::text, now());

  insert into public."creator_payout_batch_items" (
    "id",
    "batch_id",
    "creator_user_id",
    "amount_cents",
    "currency",
    "status",
    "metadata"
  ) values (
    batch_item_id,
    batch_id,
    'payout_review_batch_foundation_creator',
    0,
    'USD',
    'foundation',
    proof_metadata
  )
  on conflict ("id") do update set
    "status" = excluded."status",
    "amount_cents" = excluded."amount_cents",
    "metadata" = excluded."metadata";

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
    'payout_review_batch_foundation_recorded',
    'payout',
    'creator_payout_batches',
    batch_id::text,
    'Payout review and batch draft foundation proof only; no payout approval, processing, transfer, or live money action.',
    proof_metadata
  where not exists (
    select 1
    from public."platform_admin_audit_logs"
    where "id" = audit_id
  );
end $$;
