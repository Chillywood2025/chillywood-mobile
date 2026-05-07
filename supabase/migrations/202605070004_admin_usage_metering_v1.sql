create table if not exists public."provider_accounts" (
  "id" uuid default gen_random_uuid() not null,
  "provider" text not null,
  "display_name" text not null,
  "account_reference" text,
  "status" text default 'planned'::text not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "provider_accounts_pkey" primary key ("id"),
  constraint "provider_accounts_provider_check"
    check ("provider" in (
      'cloudflare_r2',
      'hetzner_object_storage',
      'hetzner_server',
      'ovh_object_storage',
      'ovh_server',
      'manual'
    )),
  constraint "provider_accounts_status_check"
    check ("status" in ('planned', 'connected', 'paused', 'disabled'))
);

comment on table public."provider_accounts" is
  'Provider account metadata only. Do not store API keys, tokens, credentials, or secrets.';

create index if not exists "provider_accounts_provider_status_idx"
  on public."provider_accounts" using btree ("provider", "status", "created_at" desc);

create table if not exists public."usage_meter_events" (
  "id" uuid default gen_random_uuid() not null,
  "event_type" text not null,
  "event_source" text default 'app'::text not null,
  "user_id" text,
  "channel_user_id" text,
  "room_id" text,
  "media_id" text,
  "provider_account_id" uuid,
  "storage_provider" text,
  "usage_class" text not null,
  "quantity" numeric not null default 1,
  "unit" text not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "usage_meter_events_pkey" primary key ("id"),
  constraint "usage_meter_events_provider_account_fkey"
    foreign key ("provider_account_id") references public."provider_accounts"("id") on delete set null,
  constraint "usage_meter_events_event_type_check"
    check ("event_type" in (
      'room_started',
      'room_ended',
      'participant_joined',
      'participant_left',
      'video_uploaded',
      'video_published',
      'video_play_opened',
      'media_delivery_estimate',
      'provider_import_placeholder'
    )),
  constraint "usage_meter_events_usage_class_check"
    check ("usage_class" in (
      'live',
      'watch_party',
      'public_vod',
      'upload',
      'storage_estimate',
      'provider_import',
      'admin_estimate'
    )),
  constraint "usage_meter_events_quantity_check" check ("quantity" >= 0),
  constraint "usage_meter_events_unit_check"
    check ("unit" in ('event', 'seconds', 'participant_minute', 'bytes', 'gb', 'request', 'object', 'room'))
);

create index if not exists "usage_meter_events_created_at_idx"
  on public."usage_meter_events" using btree ("created_at" desc);

create index if not exists "usage_meter_events_user_id_idx"
  on public."usage_meter_events" using btree ("user_id", "created_at" desc);

create index if not exists "usage_meter_events_channel_user_id_idx"
  on public."usage_meter_events" using btree ("channel_user_id", "created_at" desc);

create index if not exists "usage_meter_events_room_id_idx"
  on public."usage_meter_events" using btree ("room_id", "created_at" desc);

create index if not exists "usage_meter_events_media_id_idx"
  on public."usage_meter_events" using btree ("media_id", "created_at" desc);

create index if not exists "usage_meter_events_usage_class_idx"
  on public."usage_meter_events" using btree ("usage_class", "created_at" desc);

create table if not exists public."usage_daily_summaries" (
  "id" uuid default gen_random_uuid() not null,
  "usage_date" date not null,
  "user_id" text,
  "channel_user_id" text,
  "room_id" text,
  "media_id" text,
  "usage_class" text not null,
  "metric_key" text not null,
  "quantity" numeric not null default 0,
  "unit" text not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "usage_daily_summaries_pkey" primary key ("id"),
  constraint "usage_daily_summaries_usage_class_check"
    check ("usage_class" in (
      'live',
      'watch_party',
      'public_vod',
      'upload',
      'storage_estimate',
      'provider_import',
      'admin_estimate'
    )),
  constraint "usage_daily_summaries_quantity_check" check ("quantity" >= 0),
  constraint "usage_daily_summaries_unit_check"
    check ("unit" in ('event', 'seconds', 'participant_minute', 'bytes', 'gb', 'request', 'object', 'room'))
);

create index if not exists "usage_daily_summaries_usage_date_idx"
  on public."usage_daily_summaries" using btree ("usage_date" desc);

create unique index if not exists "usage_daily_summaries_scope_metric_unique"
  on public."usage_daily_summaries" using btree (
    "usage_date",
    (coalesce("user_id", ''::text)),
    (coalesce("channel_user_id", ''::text)),
    (coalesce("room_id", ''::text)),
    (coalesce("media_id", ''::text)),
    "usage_class",
    "metric_key",
    "unit"
  );

create table if not exists public."usage_monthly_summaries" (
  "id" uuid default gen_random_uuid() not null,
  "usage_month" date not null,
  "user_id" text,
  "channel_user_id" text,
  "room_id" text,
  "media_id" text,
  "usage_class" text not null,
  "metric_key" text not null,
  "quantity" numeric not null default 0,
  "unit" text not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "usage_monthly_summaries_pkey" primary key ("id"),
  constraint "usage_monthly_summaries_month_start_check"
    check (extract(day from "usage_month") = 1),
  constraint "usage_monthly_summaries_usage_class_check"
    check ("usage_class" in (
      'live',
      'watch_party',
      'public_vod',
      'upload',
      'storage_estimate',
      'provider_import',
      'admin_estimate'
    )),
  constraint "usage_monthly_summaries_quantity_check" check ("quantity" >= 0),
  constraint "usage_monthly_summaries_unit_check"
    check ("unit" in ('event', 'seconds', 'participant_minute', 'bytes', 'gb', 'request', 'object', 'room'))
);

create index if not exists "usage_monthly_summaries_usage_month_idx"
  on public."usage_monthly_summaries" using btree ("usage_month" desc);

create unique index if not exists "usage_monthly_summaries_scope_metric_unique"
  on public."usage_monthly_summaries" using btree (
    "usage_month",
    (coalesce("user_id", ''::text)),
    (coalesce("channel_user_id", ''::text)),
    (coalesce("room_id", ''::text)),
    (coalesce("media_id", ''::text)),
    "usage_class",
    "metric_key",
    "unit"
  );

create table if not exists public."provider_usage_imports" (
  "id" uuid default gen_random_uuid() not null,
  "provider_account_id" uuid,
  "provider" text not null,
  "import_type" text not null,
  "period_start" timestamp with time zone not null,
  "period_end" timestamp with time zone not null,
  "status" text default 'planned'::text not null,
  "source_reference" text,
  "records_imported" integer default 0 not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "error_message" text,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "provider_usage_imports_pkey" primary key ("id"),
  constraint "provider_usage_imports_provider_account_fkey"
    foreign key ("provider_account_id") references public."provider_accounts"("id") on delete set null,
  constraint "provider_usage_imports_provider_check"
    check ("provider" in (
      'cloudflare_r2',
      'hetzner_object_storage',
      'hetzner_server',
      'ovh_object_storage',
      'ovh_server',
      'manual'
    )),
  constraint "provider_usage_imports_type_check"
    check ("import_type" in ('usage_daily', 'billing_snapshot', 'manual', 'reconciliation', 'placeholder')),
  constraint "provider_usage_imports_status_check"
    check ("status" in ('planned', 'running', 'completed', 'failed', 'canceled')),
  constraint "provider_usage_imports_records_check" check ("records_imported" >= 0),
  constraint "provider_usage_imports_period_check" check ("period_end" > "period_start")
);

create index if not exists "provider_usage_imports_provider_status_idx"
  on public."provider_usage_imports" using btree ("provider", "status", "created_at" desc);

create table if not exists public."provider_usage_daily" (
  "id" uuid default gen_random_uuid() not null,
  "provider_account_id" uuid,
  "provider" text not null,
  "usage_date" date not null,
  "resource_type" text not null,
  "resource_name" text,
  "metric_key" text not null,
  "quantity" numeric not null default 0,
  "unit" text not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "import_id" uuid,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "provider_usage_daily_pkey" primary key ("id"),
  constraint "provider_usage_daily_provider_account_fkey"
    foreign key ("provider_account_id") references public."provider_accounts"("id") on delete set null,
  constraint "provider_usage_daily_import_fkey"
    foreign key ("import_id") references public."provider_usage_imports"("id") on delete set null,
  constraint "provider_usage_daily_provider_check"
    check ("provider" in (
      'cloudflare_r2',
      'hetzner_object_storage',
      'hetzner_server',
      'ovh_object_storage',
      'ovh_server',
      'manual'
    )),
  constraint "provider_usage_daily_quantity_check" check ("quantity" >= 0)
);

create index if not exists "provider_usage_daily_provider_date_metric_idx"
  on public."provider_usage_daily" using btree ("provider", "usage_date" desc, "metric_key");

create table if not exists public."provider_billing_snapshots" (
  "id" uuid default gen_random_uuid() not null,
  "provider_account_id" uuid,
  "provider" text not null,
  "billing_month" date not null,
  "currency" text default 'USD'::text not null,
  "amount" numeric,
  "status" text default 'planned'::text not null,
  "source_reference" text,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "provider_billing_snapshots_pkey" primary key ("id"),
  constraint "provider_billing_snapshots_provider_account_fkey"
    foreign key ("provider_account_id") references public."provider_accounts"("id") on delete set null,
  constraint "provider_billing_snapshots_provider_check"
    check ("provider" in (
      'cloudflare_r2',
      'hetzner_object_storage',
      'hetzner_server',
      'ovh_object_storage',
      'ovh_server',
      'manual'
    )),
  constraint "provider_billing_snapshots_month_start_check"
    check (extract(day from "billing_month") = 1),
  constraint "provider_billing_snapshots_amount_check" check ("amount" is null or "amount" >= 0),
  constraint "provider_billing_snapshots_currency_check" check ("currency" ~ '^[A-Z]{3}$'),
  constraint "provider_billing_snapshots_status_check"
    check ("status" in ('planned', 'imported', 'reconciled', 'disputed', 'void'))
);

create index if not exists "provider_billing_snapshots_provider_billing_month_idx"
  on public."provider_billing_snapshots" using btree ("provider", "billing_month" desc);

create table if not exists public."provider_usage_reconciliation" (
  "id" uuid default gen_random_uuid() not null,
  "period_start" date not null,
  "period_end" date not null,
  "provider" text not null,
  "usage_class" text not null,
  "internal_quantity" numeric,
  "provider_quantity" numeric,
  "variance_quantity" numeric,
  "unit" text not null,
  "status" text default 'pending'::text not null,
  "notes" text,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "provider_usage_reconciliation_pkey" primary key ("id"),
  constraint "provider_usage_reconciliation_provider_check"
    check ("provider" in (
      'cloudflare_r2',
      'hetzner_object_storage',
      'hetzner_server',
      'ovh_object_storage',
      'ovh_server',
      'manual'
    )),
  constraint "provider_usage_reconciliation_usage_class_check"
    check ("usage_class" in ('live', 'watch_party', 'public_vod', 'upload', 'storage_estimate', 'provider_import', 'admin_estimate')),
  constraint "provider_usage_reconciliation_status_check"
    check ("status" in ('pending', 'matched', 'variance', 'reviewed', 'ignored')),
  constraint "provider_usage_reconciliation_period_check" check ("period_end" >= "period_start"),
  constraint "provider_usage_reconciliation_internal_quantity_check" check ("internal_quantity" is null or "internal_quantity" >= 0),
  constraint "provider_usage_reconciliation_provider_quantity_check" check ("provider_quantity" is null or "provider_quantity" >= 0)
);

create index if not exists "provider_usage_reconciliation_provider_period_idx"
  on public."provider_usage_reconciliation" using btree ("provider", "period_start" desc, "period_end" desc);

alter table public."provider_accounts" enable row level security;
alter table public."usage_meter_events" enable row level security;
alter table public."usage_daily_summaries" enable row level security;
alter table public."usage_monthly_summaries" enable row level security;
alter table public."provider_usage_imports" enable row level security;
alter table public."provider_usage_daily" enable row level security;
alter table public."provider_billing_snapshots" enable row level security;
alter table public."provider_usage_reconciliation" enable row level security;

drop policy if exists "provider_accounts_select_owner_operator" on public."provider_accounts";
create policy "provider_accounts_select_owner_operator"
  on public."provider_accounts"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "usage_meter_events_select_owner_operator" on public."usage_meter_events";
create policy "usage_meter_events_select_owner_operator"
  on public."usage_meter_events"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "usage_daily_summaries_select_owner_operator" on public."usage_daily_summaries";
create policy "usage_daily_summaries_select_owner_operator"
  on public."usage_daily_summaries"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "usage_monthly_summaries_select_owner_operator" on public."usage_monthly_summaries";
create policy "usage_monthly_summaries_select_owner_operator"
  on public."usage_monthly_summaries"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "provider_usage_imports_select_owner_operator" on public."provider_usage_imports";
create policy "provider_usage_imports_select_owner_operator"
  on public."provider_usage_imports"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "provider_usage_daily_select_owner_operator" on public."provider_usage_daily";
create policy "provider_usage_daily_select_owner_operator"
  on public."provider_usage_daily"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "provider_billing_snapshots_select_owner_operator" on public."provider_billing_snapshots";
create policy "provider_billing_snapshots_select_owner_operator"
  on public."provider_billing_snapshots"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "provider_usage_reconciliation_select_owner_operator" on public."provider_usage_reconciliation";
create policy "provider_usage_reconciliation_select_owner_operator"
  on public."provider_usage_reconciliation"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

grant select on table public."provider_accounts" to "authenticated";
grant select on table public."usage_meter_events" to "authenticated";
grant select on table public."usage_daily_summaries" to "authenticated";
grant select on table public."usage_monthly_summaries" to "authenticated";
grant select on table public."provider_usage_imports" to "authenticated";
grant select on table public."provider_usage_daily" to "authenticated";
grant select on table public."provider_billing_snapshots" to "authenticated";
grant select on table public."provider_usage_reconciliation" to "authenticated";
