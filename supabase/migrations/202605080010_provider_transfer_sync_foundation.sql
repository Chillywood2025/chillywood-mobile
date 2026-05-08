alter table public."creator_payout_provider_transfers"
  add column if not exists "provider_status" text,
  add column if not exists "last_provider_sync_at" timestamp with time zone;

alter table public."creator_payout_provider_transfers"
  drop constraint if exists "creator_payout_provider_transfers_status_check";

alter table public."creator_payout_provider_transfers"
  add constraint "creator_payout_provider_transfers_status_check"
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
      'cancelled',
      'foundation',
      'draft',
      'created_test_later',
      'pending_later',
      'in_transit_later',
      'paid_later',
      'failed_later',
      'cancelled_later',
      'reversed_later',
      'sync_required',
      'sync_failed',
      'synced_test'
    ));

create index if not exists "creator_payout_provider_transfers_provider_transfer_idx"
  on public."creator_payout_provider_transfers" using btree ("provider", "provider_environment", "provider_transfer_id")
  where "provider_transfer_id" is not null;

create index if not exists "creator_payout_provider_transfers_provider_payout_idx"
  on public."creator_payout_provider_transfers" using btree ("provider", "provider_environment", "provider_payout_id")
  where "provider_payout_id" is not null;

create index if not exists "creator_payout_provider_transfers_status_idx"
  on public."creator_payout_provider_transfers" using btree ("status", "created_at" desc);

create index if not exists "creator_payout_provider_transfers_last_sync_idx"
  on public."creator_payout_provider_transfers" using btree ("last_provider_sync_at" desc);

create index if not exists "creator_payout_provider_transfers_creator_idx"
  on public."creator_payout_provider_transfers" using btree ("creator_user_id");

insert into public."platform_admin_audit_logs" (
  "id",
  "actor_role",
  "action",
  "action_category",
  "target_type",
  "target_id",
  "target_user_id",
  "reason",
  "metadata"
)
values (
  '2b7f81af-c7de-4b19-a1a3-9c0d6aef1010',
  'system',
  'provider_transfer_sync_foundation_recorded',
  'payout',
  'creator_payout_provider_transfer',
  '10e8d0b8-77f1-47fd-bf02-f2a1632a2010',
  'provider_transfer_sync_foundation_creator',
  'Provider transfer sync foundation proof row recorded; no transfer, payout, checkout, or live money movement occurred.',
  jsonb_build_object(
    'provider_transfer_sync_foundation_proof', true,
    'created_by', 'codex_provider_transfer_sync_foundation',
    'foundation_only', true,
    'live_money_action', false,
    'transfer_creation', false,
    'payout_creation', false,
    'checkout_creation', false,
    'provider', 'stripe',
    'mode', 'test'
  )
)
on conflict ("id") do nothing;

insert into public."creator_payout_provider_transfers" (
  "id",
  "creator_user_id",
  "provider",
  "provider_environment",
  "amount_minor",
  "currency",
  "status",
  "provider_status",
  "failure_code",
  "failure_message",
  "platform_admin_audit_log_id",
  "metadata"
)
values (
  '10e8d0b8-77f1-47fd-bf02-f2a1632a2010',
  'provider_transfer_sync_foundation_creator',
  'stripe_connect',
  'test',
  0,
  'usd',
  'sync_required',
  'not_connected',
  null,
  null,
  '2b7f81af-c7de-4b19-a1a3-9c0d6aef1010',
  jsonb_build_object(
    'provider_transfer_sync_foundation_proof', true,
    'created_by', 'codex_provider_transfer_sync_foundation',
    'foundation_only', true,
    'live_money_action', false,
    'transfer_creation', false,
    'payout_creation', false,
    'checkout_creation', false,
    'provider_transfer_id_created', false,
    'provider_payout_id_created', false,
    'sync_only', true
  )
)
on conflict ("id") do update
set
  "status" = excluded."status",
  "provider_status" = excluded."provider_status",
  "platform_admin_audit_log_id" = excluded."platform_admin_audit_log_id",
  "metadata" = excluded."metadata",
  "updated_at" = timezone('utc'::text, now());
