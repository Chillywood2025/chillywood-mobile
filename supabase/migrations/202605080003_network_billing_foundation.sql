alter table public."network_billing_accounts"
  add column if not exists "display_name" text,
  add column if not exists "billing_email" text,
  add column if not exists "external_customer_reference" text;

alter table public."network_billing_accounts"
  drop constraint if exists "network_billing_accounts_status_check";

alter table public."network_billing_accounts"
  add constraint "network_billing_accounts_status_check"
  check ("status" in ('foundation', 'draft', 'pending_review', 'active', 'paused', 'cancelled', 'closed'));

alter table public."network_invoice_records"
  add column if not exists "invoice_month" date,
  add column if not exists "subtotal_cents" integer default 0 not null,
  add column if not exists "total_cents" integer default 0 not null;

create table if not exists public."network_plan_records" (
  "id" uuid default gen_random_uuid() not null,
  "plan_key" text not null,
  "display_name" text not null,
  "status" text default 'foundation'::text not null,
  "monthly_platform_fee_cents" integer,
  "currency" text default 'usd'::text not null,
  "included_storage_gb" numeric,
  "included_bandwidth_tb" numeric,
  "included_live_participant_minutes" numeric,
  "included_team_seats" integer,
  "overage_bandwidth_cents_per_tb" integer,
  "overage_storage_cents_per_gb_month" integer,
  "overage_participant_minute_cents" numeric,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "metadata" jsonb default '{}'::jsonb not null,
  constraint "network_plan_records_pkey" primary key ("id"),
  constraint "network_plan_records_plan_key_key" unique ("plan_key"),
  constraint "network_plan_records_status_check"
    check ("status" in ('foundation', 'draft', 'pending_review', 'active', 'paused', 'cancelled')),
  constraint "network_plan_records_currency_check" check ("currency" ~ '^[a-z]{3}$'),
  constraint "network_plan_records_monthly_fee_check"
    check ("monthly_platform_fee_cents" is null or "monthly_platform_fee_cents" >= 0),
  constraint "network_plan_records_team_seats_check"
    check ("included_team_seats" is null or "included_team_seats" >= 0)
);

create table if not exists public."network_account_plan_assignments" (
  "id" uuid default gen_random_uuid() not null,
  "network_account_id" bigint not null,
  "plan_id" uuid,
  "status" text default 'foundation'::text not null,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "metadata" jsonb default '{}'::jsonb not null,
  constraint "network_account_plan_assignments_pkey" primary key ("id"),
  constraint "network_account_plan_assignments_account_fkey"
    foreign key ("network_account_id") references public."network_billing_accounts"("id") on delete cascade,
  constraint "network_account_plan_assignments_plan_fkey"
    foreign key ("plan_id") references public."network_plan_records"("id") on delete set null,
  constraint "network_account_plan_assignments_status_check"
    check ("status" in ('foundation', 'draft', 'pending_review', 'active', 'paused', 'cancelled')),
  constraint "network_account_plan_assignments_period_check"
    check ("ends_at" is null or "starts_at" is null or "ends_at" > "starts_at")
);

create table if not exists public."network_quota_records" (
  "id" uuid default gen_random_uuid() not null,
  "network_account_id" bigint not null,
  "plan_assignment_id" uuid,
  "quota_key" text not null,
  "quota_value" numeric default 0 not null,
  "unit" text not null,
  "status" text default 'foundation'::text not null,
  "period_start" date,
  "period_end" date,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "metadata" jsonb default '{}'::jsonb not null,
  constraint "network_quota_records_pkey" primary key ("id"),
  constraint "network_quota_records_account_fkey"
    foreign key ("network_account_id") references public."network_billing_accounts"("id") on delete cascade,
  constraint "network_quota_records_assignment_fkey"
    foreign key ("plan_assignment_id") references public."network_account_plan_assignments"("id") on delete set null,
  constraint "network_quota_records_quota_key_check"
    check ("quota_key" in ('storage_gb', 'bandwidth_tb', 'live_participant_minutes', 'team_seats')),
  constraint "network_quota_records_value_check" check ("quota_value" >= 0),
  constraint "network_quota_records_status_check"
    check ("status" in ('foundation', 'draft', 'active', 'paused', 'cancelled')),
  constraint "network_quota_records_period_check"
    check ("period_end" is null or "period_start" is null or "period_end" >= "period_start")
);

create table if not exists public."network_invoice_line_items" (
  "id" uuid default gen_random_uuid() not null,
  "invoice_id" bigint not null,
  "line_type" text not null,
  "description" text not null,
  "quantity" numeric default 0 not null,
  "unit" text not null,
  "unit_amount_cents" integer,
  "amount_cents" integer default 0 not null,
  "status" text default 'foundation'::text not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "metadata" jsonb default '{}'::jsonb not null,
  constraint "network_invoice_line_items_pkey" primary key ("id"),
  constraint "network_invoice_line_items_invoice_fkey"
    foreign key ("invoice_id") references public."network_invoice_records"("id") on delete cascade,
  constraint "network_invoice_line_items_line_type_check"
    check ("line_type" in (
      'platform_fee',
      'bandwidth_overage',
      'storage_overage',
      'participant_minute_overage',
      'team_seat',
      'manual_adjustment'
    )),
  constraint "network_invoice_line_items_quantity_check" check ("quantity" >= 0),
  constraint "network_invoice_line_items_unit_amount_check"
    check ("unit_amount_cents" is null or "unit_amount_cents" >= 0),
  constraint "network_invoice_line_items_amount_check" check ("amount_cents" >= 0),
  constraint "network_invoice_line_items_status_check"
    check ("status" in ('foundation', 'draft', 'review_required', 'ready_later', 'cancelled'))
);

create table if not exists public."network_overage_events" (
  "id" uuid default gen_random_uuid() not null,
  "network_account_id" bigint not null,
  "usage_period_start" date not null,
  "usage_period_end" date not null,
  "usage_key" text not null,
  "included_quantity" numeric,
  "actual_quantity" numeric,
  "overage_quantity" numeric,
  "unit" text not null,
  "rate_cents_per_unit" numeric,
  "estimated_amount_cents" integer,
  "status" text default 'foundation'::text not null,
  "source" text default 'internal_estimate'::text not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "metadata" jsonb default '{}'::jsonb not null,
  constraint "network_overage_events_pkey" primary key ("id"),
  constraint "network_overage_events_account_fkey"
    foreign key ("network_account_id") references public."network_billing_accounts"("id") on delete cascade,
  constraint "network_overage_events_period_check" check ("usage_period_end" >= "usage_period_start"),
  constraint "network_overage_events_usage_key_check"
    check ("usage_key" in ('storage_gb', 'bandwidth_tb', 'live_participant_minutes', 'team_seats')),
  constraint "network_overage_events_included_check"
    check ("included_quantity" is null or "included_quantity" >= 0),
  constraint "network_overage_events_actual_check"
    check ("actual_quantity" is null or "actual_quantity" >= 0),
  constraint "network_overage_events_overage_check"
    check ("overage_quantity" is null or "overage_quantity" >= 0),
  constraint "network_overage_events_rate_check"
    check ("rate_cents_per_unit" is null or "rate_cents_per_unit" >= 0),
  constraint "network_overage_events_amount_check"
    check ("estimated_amount_cents" is null or "estimated_amount_cents" >= 0),
  constraint "network_overage_events_status_check"
    check ("status" in ('foundation', 'estimated', 'review_required', 'ignored', 'approved_later'))
);

create table if not exists public."network_billing_audit_logs" (
  "id" uuid default gen_random_uuid() not null,
  "network_account_id" bigint,
  "actor_user_id" text,
  "action" text not null,
  "target_table" text,
  "target_id" text,
  "reason" text,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "metadata" jsonb default '{}'::jsonb not null,
  constraint "network_billing_audit_logs_pkey" primary key ("id"),
  constraint "network_billing_audit_logs_account_fkey"
    foreign key ("network_account_id") references public."network_billing_accounts"("id") on delete set null,
  constraint "network_billing_audit_logs_action_check"
    check ("action" in (
      'foundation_proof_created',
      'plan_drafted',
      'quota_drafted',
      'invoice_drafted',
      'overage_estimated',
      'manual_note'
    ))
);

create index if not exists "network_plan_records_plan_key_idx"
  on public."network_plan_records" using btree ("plan_key");

create index if not exists "network_account_plan_assignments_account_idx"
  on public."network_account_plan_assignments" using btree ("network_account_id");

create index if not exists "network_quota_records_account_quota_idx"
  on public."network_quota_records" using btree ("network_account_id", "quota_key");

create index if not exists "network_invoice_records_account_idx"
  on public."network_invoice_records" using btree ("network_billing_account_id");

create index if not exists "network_invoice_records_invoice_month_idx"
  on public."network_invoice_records" using btree ("invoice_month");

create index if not exists "network_invoice_line_items_invoice_idx"
  on public."network_invoice_line_items" using btree ("invoice_id");

create index if not exists "network_overage_events_account_period_usage_idx"
  on public."network_overage_events" using btree ("network_account_id", "usage_period_start", "usage_key");

create index if not exists "network_billing_audit_logs_account_created_idx"
  on public."network_billing_audit_logs" using btree ("network_account_id", "created_at" desc);

alter table public."network_plan_records" enable row level security;
alter table public."network_account_plan_assignments" enable row level security;
alter table public."network_quota_records" enable row level security;
alter table public."network_invoice_line_items" enable row level security;
alter table public."network_overage_events" enable row level security;
alter table public."network_billing_audit_logs" enable row level security;

drop policy if exists "network_plan_records_select_owner_operator" on public."network_plan_records";
create policy "network_plan_records_select_owner_operator"
  on public."network_plan_records"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "network_plan_records_insert_owner_operator" on public."network_plan_records";
create policy "network_plan_records_insert_owner_operator"
  on public."network_plan_records"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "network_plan_records_update_owner_operator" on public."network_plan_records";
create policy "network_plan_records_update_owner_operator"
  on public."network_plan_records"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "network_account_plan_assignments_select_owner_operator" on public."network_account_plan_assignments";
create policy "network_account_plan_assignments_select_owner_operator"
  on public."network_account_plan_assignments"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "network_account_plan_assignments_insert_owner_operator" on public."network_account_plan_assignments";
create policy "network_account_plan_assignments_insert_owner_operator"
  on public."network_account_plan_assignments"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "network_account_plan_assignments_update_owner_operator" on public."network_account_plan_assignments";
create policy "network_account_plan_assignments_update_owner_operator"
  on public."network_account_plan_assignments"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "network_quota_records_select_owner_operator" on public."network_quota_records";
create policy "network_quota_records_select_owner_operator"
  on public."network_quota_records"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "network_quota_records_insert_owner_operator" on public."network_quota_records";
create policy "network_quota_records_insert_owner_operator"
  on public."network_quota_records"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "network_quota_records_update_owner_operator" on public."network_quota_records";
create policy "network_quota_records_update_owner_operator"
  on public."network_quota_records"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "network_invoice_line_items_select_owner_operator" on public."network_invoice_line_items";
create policy "network_invoice_line_items_select_owner_operator"
  on public."network_invoice_line_items"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "network_invoice_line_items_insert_owner_operator" on public."network_invoice_line_items";
create policy "network_invoice_line_items_insert_owner_operator"
  on public."network_invoice_line_items"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "network_invoice_line_items_update_owner_operator" on public."network_invoice_line_items";
create policy "network_invoice_line_items_update_owner_operator"
  on public."network_invoice_line_items"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "network_overage_events_select_owner_operator" on public."network_overage_events";
create policy "network_overage_events_select_owner_operator"
  on public."network_overage_events"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "network_overage_events_insert_owner_operator" on public."network_overage_events";
create policy "network_overage_events_insert_owner_operator"
  on public."network_overage_events"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "network_overage_events_update_owner_operator" on public."network_overage_events";
create policy "network_overage_events_update_owner_operator"
  on public."network_overage_events"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "network_billing_audit_logs_select_owner_operator" on public."network_billing_audit_logs";
create policy "network_billing_audit_logs_select_owner_operator"
  on public."network_billing_audit_logs"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "network_billing_audit_logs_insert_owner_operator" on public."network_billing_audit_logs";
create policy "network_billing_audit_logs_insert_owner_operator"
  on public."network_billing_audit_logs"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

grant select, insert, update on table public."network_plan_records" to "authenticated";
grant select, insert, update on table public."network_account_plan_assignments" to "authenticated";
grant select, insert, update on table public."network_quota_records" to "authenticated";
grant select, insert, update on table public."network_invoice_line_items" to "authenticated";
grant select, insert, update on table public."network_overage_events" to "authenticated";
grant select, insert on table public."network_billing_audit_logs" to "authenticated";

do $$
declare
  foundation_account_id bigint;
  foundation_invoice_id bigint;
  starter_plan_id uuid := '16e1fa92-442e-4628-8747-cf9c8f320a9b';
  assignment_id uuid := 'c49d074c-1709-4c14-b42c-326995e144f0';
begin
  select "id"
    into foundation_account_id
    from public."network_billing_accounts"
    where "metadata"->>'created_by' = 'codex_network_billing_foundation'
    limit 1;

  if foundation_account_id is null then
    insert into public."network_billing_accounts" (
      "network_name",
      "display_name",
      "status",
      "billing_email",
      "external_customer_reference",
      "plan_key",
      "billing_provider",
      "metadata"
    ) values (
      'Network Billing Foundation Proof',
      'Network Billing Foundation Proof',
      'foundation',
      null,
      null,
      'network_starter',
      null,
      jsonb_build_object(
        'network_billing_foundation_proof', true,
        'created_by', 'codex_network_billing_foundation',
        'foundation_only', true,
        'live_money_action', false
      )
    )
    returning "id" into foundation_account_id;
  else
    update public."network_billing_accounts"
      set
        "network_name" = coalesce("network_name", 'Network Billing Foundation Proof'),
        "display_name" = coalesce("display_name", 'Network Billing Foundation Proof'),
        "status" = 'foundation',
        "plan_key" = coalesce("plan_key", 'network_starter'),
        "billing_provider" = null,
        "billing_provider_customer_id" = null,
        "external_customer_reference" = null,
        "metadata" = "metadata" || jsonb_build_object(
          'network_billing_foundation_proof', true,
          'created_by', 'codex_network_billing_foundation',
          'foundation_only', true,
          'live_money_action', false
        ),
        "updated_at" = timezone('utc'::text, now())
      where "id" = foundation_account_id;
  end if;

  insert into public."network_plan_records" (
    "id",
    "plan_key",
    "display_name",
    "status",
    "monthly_platform_fee_cents",
    "currency",
    "included_storage_gb",
    "included_bandwidth_tb",
    "included_live_participant_minutes",
    "included_team_seats",
    "overage_bandwidth_cents_per_tb",
    "overage_storage_cents_per_gb_month",
    "overage_participant_minute_cents",
    "metadata"
  ) values (
    starter_plan_id,
    'network_starter',
    'Network Starter',
    'foundation',
    0,
    'usd',
    0,
    0,
    0,
    0,
    10000,
    null,
    null,
    jsonb_build_object(
      'network_billing_foundation_proof', true,
      'created_by', 'codex_network_billing_foundation',
      'foundation_only', true,
      'live_money_action', false,
      'overage_guidance_only', true
    )
  )
  on conflict ("plan_key") do update set
    "display_name" = excluded."display_name",
    "status" = excluded."status",
    "monthly_platform_fee_cents" = excluded."monthly_platform_fee_cents",
    "included_storage_gb" = excluded."included_storage_gb",
    "included_bandwidth_tb" = excluded."included_bandwidth_tb",
    "included_live_participant_minutes" = excluded."included_live_participant_minutes",
    "included_team_seats" = excluded."included_team_seats",
    "overage_bandwidth_cents_per_tb" = excluded."overage_bandwidth_cents_per_tb",
    "metadata" = excluded."metadata",
    "updated_at" = timezone('utc'::text, now());

  select "id" into starter_plan_id
    from public."network_plan_records"
    where "plan_key" = 'network_starter'
    limit 1;

  insert into public."network_account_plan_assignments" (
    "id",
    "network_account_id",
    "plan_id",
    "status",
    "metadata"
  ) values (
    assignment_id,
    foundation_account_id,
    starter_plan_id,
    'foundation',
    jsonb_build_object(
      'network_billing_foundation_proof', true,
      'created_by', 'codex_network_billing_foundation',
      'foundation_only', true,
      'live_money_action', false
    )
  )
  on conflict ("id") do update set
    "network_account_id" = excluded."network_account_id",
    "plan_id" = excluded."plan_id",
    "status" = excluded."status",
    "metadata" = excluded."metadata",
    "updated_at" = timezone('utc'::text, now());

  insert into public."network_quota_records" (
    "id",
    "network_account_id",
    "plan_assignment_id",
    "quota_key",
    "quota_value",
    "unit",
    "status",
    "metadata"
  ) values
    (
      '9535e8bf-63f9-43d1-abbd-603c9822924d',
      foundation_account_id,
      assignment_id,
      'storage_gb',
      0,
      'gb',
      'foundation',
      jsonb_build_object('network_billing_foundation_proof', true, 'created_by', 'codex_network_billing_foundation', 'foundation_only', true, 'live_money_action', false)
    ),
    (
      '257e51e6-99ce-4579-a34d-18f2feb4bd31',
      foundation_account_id,
      assignment_id,
      'bandwidth_tb',
      0,
      'tb',
      'foundation',
      jsonb_build_object('network_billing_foundation_proof', true, 'created_by', 'codex_network_billing_foundation', 'foundation_only', true, 'live_money_action', false)
    ),
    (
      'f18b023e-1889-487d-88d0-11b636d8fd58',
      foundation_account_id,
      assignment_id,
      'live_participant_minutes',
      0,
      'participant_minute',
      'foundation',
      jsonb_build_object('network_billing_foundation_proof', true, 'created_by', 'codex_network_billing_foundation', 'foundation_only', true, 'live_money_action', false)
    ),
    (
      'b70707e4-6353-45c7-a8cf-d5c96c4e4e82',
      foundation_account_id,
      assignment_id,
      'team_seats',
      0,
      'seat',
      'foundation',
      jsonb_build_object('network_billing_foundation_proof', true, 'created_by', 'codex_network_billing_foundation', 'foundation_only', true, 'live_money_action', false)
    )
  on conflict ("id") do update set
    "network_account_id" = excluded."network_account_id",
    "plan_assignment_id" = excluded."plan_assignment_id",
    "quota_value" = excluded."quota_value",
    "status" = excluded."status",
    "metadata" = excluded."metadata",
    "updated_at" = timezone('utc'::text, now());

  select "id"
    into foundation_invoice_id
    from public."network_invoice_records"
    where "invoice_number" = 'network_billing_foundation_proof'
    limit 1;

  if foundation_invoice_id is null then
    insert into public."network_invoice_records" (
      "network_billing_account_id",
      "invoice_number",
      "invoice_period_start",
      "invoice_period_end",
      "invoice_month",
      "amount_minor",
      "subtotal_cents",
      "total_cents",
      "currency",
      "status",
      "billing_provider",
      "billing_provider_invoice_id",
      "metadata"
    ) values (
      foundation_account_id,
      'network_billing_foundation_proof',
      date_trunc('month', timezone('utc'::text, now()))::date,
      (date_trunc('month', timezone('utc'::text, now())) + interval '1 month - 1 day')::date,
      date_trunc('month', timezone('utc'::text, now()))::date,
      0,
      0,
      0,
      'usd',
      'foundation',
      null,
      null,
      jsonb_build_object(
        'network_billing_foundation_proof', true,
        'created_by', 'codex_network_billing_foundation',
        'foundation_only', true,
        'live_money_action', false
      )
    )
    returning "id" into foundation_invoice_id;
  else
    update public."network_invoice_records"
      set
        "network_billing_account_id" = foundation_account_id,
        "invoice_month" = date_trunc('month', timezone('utc'::text, now()))::date,
        "amount_minor" = 0,
        "subtotal_cents" = 0,
        "total_cents" = 0,
        "currency" = 'usd',
        "status" = 'foundation',
        "billing_provider" = null,
        "billing_provider_invoice_id" = null,
        "metadata" = "metadata" || jsonb_build_object(
          'network_billing_foundation_proof', true,
          'created_by', 'codex_network_billing_foundation',
          'foundation_only', true,
          'live_money_action', false
        ),
        "updated_at" = timezone('utc'::text, now())
      where "id" = foundation_invoice_id;
  end if;

  insert into public."network_invoice_line_items" (
    "id",
    "invoice_id",
    "line_type",
    "description",
    "quantity",
    "unit",
    "unit_amount_cents",
    "amount_cents",
    "status",
    "metadata"
  ) values (
    'beadfc05-6a4b-46b0-92ea-bdaea7019301',
    foundation_invoice_id,
    'platform_fee',
    'Foundation proof line item only; no invoice can be sent or charged.',
    0,
    'month',
    0,
    0,
    'foundation',
    jsonb_build_object(
      'network_billing_foundation_proof', true,
      'created_by', 'codex_network_billing_foundation',
      'foundation_only', true,
      'live_money_action', false
    )
  )
  on conflict ("id") do update set
    "invoice_id" = excluded."invoice_id",
    "description" = excluded."description",
    "amount_cents" = excluded."amount_cents",
    "status" = excluded."status",
    "metadata" = excluded."metadata",
    "updated_at" = timezone('utc'::text, now());

  insert into public."network_overage_events" (
    "id",
    "network_account_id",
    "usage_period_start",
    "usage_period_end",
    "usage_key",
    "included_quantity",
    "actual_quantity",
    "overage_quantity",
    "unit",
    "rate_cents_per_unit",
    "estimated_amount_cents",
    "status",
    "source",
    "metadata"
  ) values (
    '1bc96f73-0705-41f1-ae6d-9ab34312adbd',
    foundation_account_id,
    date_trunc('month', timezone('utc'::text, now()))::date,
    (date_trunc('month', timezone('utc'::text, now())) + interval '1 month - 1 day')::date,
    'bandwidth_tb',
    0,
    0,
    0,
    'tb',
    0,
    0,
    'foundation',
    'internal_estimate',
    jsonb_build_object(
      'network_billing_foundation_proof', true,
      'created_by', 'codex_network_billing_foundation',
      'foundation_only', true,
      'live_money_action', false,
      'not_billing_truth', true
    )
  )
  on conflict ("id") do update set
    "network_account_id" = excluded."network_account_id",
    "usage_period_start" = excluded."usage_period_start",
    "usage_period_end" = excluded."usage_period_end",
    "included_quantity" = excluded."included_quantity",
    "actual_quantity" = excluded."actual_quantity",
    "overage_quantity" = excluded."overage_quantity",
    "rate_cents_per_unit" = excluded."rate_cents_per_unit",
    "estimated_amount_cents" = excluded."estimated_amount_cents",
    "status" = excluded."status",
    "metadata" = excluded."metadata",
    "updated_at" = timezone('utc'::text, now());

  insert into public."network_billing_audit_logs" (
    "id",
    "network_account_id",
    "actor_user_id",
    "action",
    "target_table",
    "target_id",
    "reason",
    "metadata"
  ) values (
    'ff1ac0fa-7f6a-4210-8ff9-db983b641bb7',
    foundation_account_id,
    null,
    'foundation_proof_created',
    'network_billing_accounts',
    foundation_account_id::text,
    'Network billing foundation proof row only; no customer can be charged.',
    jsonb_build_object(
      'network_billing_foundation_proof', true,
      'created_by', 'codex_network_billing_foundation',
      'foundation_only', true,
      'live_money_action', false
    )
  )
  on conflict ("id") do nothing;
end $$;
