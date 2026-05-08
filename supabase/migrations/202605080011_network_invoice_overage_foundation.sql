alter table public."network_invoice_records"
  drop constraint if exists "network_invoice_records_status_check";

alter table public."network_invoice_records"
  add constraint "network_invoice_records_status_check"
  check ("status" in (
    'foundation',
    'draft',
    'review_required',
    'ready_later',
    'cancelled',
    'void_later',
    'open',
    'paid',
    'void',
    'uncollectible'
  ));

alter table public."network_invoice_line_items"
  drop constraint if exists "network_invoice_line_items_line_type_check";

alter table public."network_invoice_line_items"
  add constraint "network_invoice_line_items_line_type_check"
  check ("line_type" in (
    'platform_fee',
    'bandwidth_overage',
    'storage_overage',
    'participant_minute_overage',
    'team_seat',
    'manual_adjustment',
    'foundation_proof'
  ));

alter table public."network_overage_events"
  drop constraint if exists "network_overage_events_usage_key_check";

alter table public."network_overage_events"
  add constraint "network_overage_events_usage_key_check"
  check ("usage_key" in (
    'bandwidth_tb',
    'storage_gb',
    'live_participant_minutes',
    'team_seats',
    'manual_foundation'
  ));

alter table public."network_overage_events"
  drop constraint if exists "network_overage_events_status_check";

alter table public."network_overage_events"
  add constraint "network_overage_events_status_check"
  check ("status" in (
    'foundation',
    'estimated',
    'review_required',
    'ignored',
    'approved_later',
    'warning_only'
  ));

create index if not exists "network_invoice_records_status_idx"
  on public."network_invoice_records" using btree ("status");

create index if not exists "network_invoice_line_items_line_type_idx"
  on public."network_invoice_line_items" using btree ("line_type");

create index if not exists "network_overage_events_account_usage_idx"
  on public."network_overage_events" using btree ("network_account_id", "usage_key");

create index if not exists "network_overage_events_status_idx"
  on public."network_overage_events" using btree ("status");

do $$
declare
  foundation_account_id bigint;
  draft_invoice_id bigint;
begin
  select "id"
    into foundation_account_id
    from public."network_billing_accounts"
    where "metadata" @> '{"network_billing_foundation_proof": true}'::jsonb
    order by "created_at" asc
    limit 1;

  if foundation_account_id is null then
    insert into public."network_billing_accounts" (
      "network_owner_user_id",
      "network_name",
      "display_name",
      "status",
      "billing_provider",
      "billing_provider_customer_id",
      "external_customer_reference",
      "metadata"
    ) values (
      null,
      'Network invoice overage foundation proof',
      'Network invoice overage foundation proof',
      'foundation',
      null,
      null,
      null,
      jsonb_build_object(
        'network_invoice_draft_foundation_proof', true,
        'network_overage_warning_foundation_proof', true,
        'created_by', 'codex_network_invoice_overage_foundation',
        'foundation_only', true,
        'live_money_action', false,
        'customer_charge', false,
        'invoice_sent', false,
        'billing_execution', false
      )
    )
    returning "id" into foundation_account_id;
  end if;

  select "id"
    into draft_invoice_id
    from public."network_invoice_records"
    where "invoice_number" = 'network_invoice_draft_foundation_proof'
    limit 1;

  if draft_invoice_id is null then
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
      'network_invoice_draft_foundation_proof',
      date_trunc('month', timezone('utc'::text, now()))::date,
      (date_trunc('month', timezone('utc'::text, now())) + interval '1 month - 1 day')::date,
      date_trunc('month', timezone('utc'::text, now()))::date,
      0,
      0,
      0,
      'usd',
      'draft',
      null,
      null,
      jsonb_build_object(
        'network_invoice_draft_foundation_proof', true,
        'created_by', 'codex_network_invoice_draft_foundation',
        'foundation_only', true,
        'live_money_action', false,
        'customer_charge', false,
        'invoice_sent', false,
        'draft_internal_only', true
      )
    )
    returning "id" into draft_invoice_id;
  else
    update public."network_invoice_records"
      set
        "network_billing_account_id" = foundation_account_id,
        "invoice_month" = date_trunc('month', timezone('utc'::text, now()))::date,
        "amount_minor" = 0,
        "subtotal_cents" = 0,
        "total_cents" = 0,
        "currency" = 'usd',
        "status" = 'draft',
        "billing_provider" = null,
        "billing_provider_invoice_id" = null,
        "metadata" = "metadata" || jsonb_build_object(
          'network_invoice_draft_foundation_proof', true,
          'created_by', 'codex_network_invoice_draft_foundation',
          'foundation_only', true,
          'live_money_action', false,
          'customer_charge', false,
          'invoice_sent', false,
          'draft_internal_only', true
        ),
        "updated_at" = timezone('utc'::text, now())
      where "id" = draft_invoice_id;
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
    '2fd28648-b514-4a38-81ec-ead7e22dd3c3',
    draft_invoice_id,
    'foundation_proof',
    'Draft invoice foundation proof only; no invoice can be sent or charged.',
    0,
    'proof',
    0,
    0,
    'draft',
    jsonb_build_object(
      'network_invoice_draft_foundation_proof', true,
      'created_by', 'codex_network_invoice_draft_foundation',
      'foundation_only', true,
      'live_money_action', false,
      'customer_charge', false,
      'invoice_sent', false
    )
  )
  on conflict ("id") do update set
    "invoice_id" = excluded."invoice_id",
    "line_type" = excluded."line_type",
    "description" = excluded."description",
    "quantity" = excluded."quantity",
    "unit" = excluded."unit",
    "unit_amount_cents" = excluded."unit_amount_cents",
    "amount_cents" = excluded."amount_cents",
    "status" = excluded."status",
    "metadata" = excluded."metadata",
    "updated_at" = timezone('utc'::text, now());

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
    '8393e19e-01fa-41e3-98f3-9886ed9a518b',
    draft_invoice_id,
    'bandwidth_overage',
    'Bandwidth overage foundation line item only; provider reconciliation is required before billing.',
    0,
    'tb',
    0,
    0,
    'foundation',
    jsonb_build_object(
      'network_invoice_draft_foundation_proof', true,
      'created_by', 'codex_network_invoice_draft_foundation',
      'foundation_only', true,
      'live_money_action', false,
      'customer_charge', false,
      'invoice_sent', false,
      'trusted_usage_required_before_billing', true
    )
  )
  on conflict ("id") do update set
    "invoice_id" = excluded."invoice_id",
    "line_type" = excluded."line_type",
    "description" = excluded."description",
    "quantity" = excluded."quantity",
    "unit" = excluded."unit",
    "unit_amount_cents" = excluded."unit_amount_cents",
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
    '745d05a4-fcab-4083-a554-c6a871ae3c5c',
    foundation_account_id,
    date_trunc('month', timezone('utc'::text, now()))::date,
    (date_trunc('month', timezone('utc'::text, now())) + interval '1 month - 1 day')::date,
    'bandwidth_tb',
    null,
    null,
    null,
    'tb',
    null,
    0,
    'warning_only',
    'foundation_readout',
    jsonb_build_object(
      'network_overage_warning_foundation_proof', true,
      'created_by', 'codex_network_overage_warning_foundation',
      'foundation_only', true,
      'billing_execution', false,
      'live_money_action', false,
      'customer_charge', false,
      'trusted_usage_required_before_billing', true,
      'warning_thresholds', jsonb_build_array('50', '75', '90', '100')
    )
  )
  on conflict ("id") do update set
    "network_account_id" = excluded."network_account_id",
    "usage_period_start" = excluded."usage_period_start",
    "usage_period_end" = excluded."usage_period_end",
    "usage_key" = excluded."usage_key",
    "included_quantity" = excluded."included_quantity",
    "actual_quantity" = excluded."actual_quantity",
    "overage_quantity" = excluded."overage_quantity",
    "unit" = excluded."unit",
    "rate_cents_per_unit" = excluded."rate_cents_per_unit",
    "estimated_amount_cents" = excluded."estimated_amount_cents",
    "status" = excluded."status",
    "source" = excluded."source",
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
    'ecbd9f8b-fd5a-4ac2-b0e4-0f9e426c65d0',
    foundation_account_id,
    null,
    'invoice_drafted',
    'network_invoice_records',
    draft_invoice_id::text,
    'Network invoice draft workflow foundation proof only; no invoice can be sent.',
    jsonb_build_object(
      'network_invoice_draft_foundation_proof', true,
      'created_by', 'codex_network_invoice_draft_foundation',
      'foundation_only', true,
      'live_money_action', false,
      'customer_charge', false,
      'invoice_sent', false
    )
  )
  on conflict ("id") do nothing;

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
    '02d49db9-fdcb-44d2-96d4-c5a05dad3c6c',
    foundation_account_id,
    null,
    'overage_estimated',
    'network_overage_events',
    '745d05a4-fcab-4083-a554-c6a871ae3c5c',
    'Network overage warning readout foundation proof only; billing execution is not active.',
    jsonb_build_object(
      'network_overage_warning_foundation_proof', true,
      'created_by', 'codex_network_overage_warning_foundation',
      'foundation_only', true,
      'billing_execution', false,
      'live_money_action', false
    )
  )
  on conflict ("id") do nothing;
end $$;
