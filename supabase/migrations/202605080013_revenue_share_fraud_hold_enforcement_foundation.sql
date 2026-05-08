create table if not exists public."creator_revenue_share_rules" (
  "id" uuid default gen_random_uuid() not null,
  "rule_key" text not null,
  "display_name" text not null,
  "source_type" text not null,
  "creator_share_bps" integer not null,
  "platform_share_bps" integer not null,
  "status" text default 'foundation'::text not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "creator_revenue_share_rules_pkey" primary key ("id"),
  constraint "creator_revenue_share_rules_rule_key_key" unique ("rule_key"),
  constraint "creator_revenue_share_rules_bps_check"
    check (
      "creator_share_bps" >= 0
      and "platform_share_bps" >= 0
      and ("creator_share_bps" + "platform_share_bps") <= 10000
    ),
  constraint "creator_revenue_share_rules_source_type_check"
    check ("source_type" in (
      'platform_served_creator_page_ad_later',
      'creator_sold_sponsor_slot_later',
      'tip_later',
      'paid_content_later',
      'manual_foundation',
      'revenue_import_later'
    )),
  constraint "creator_revenue_share_rules_status_check"
    check ("status" in ('foundation', 'planned', 'active_later', 'retired'))
);

create table if not exists public."creator_revenue_share_ledger_entries" (
  "id" uuid default gen_random_uuid() not null,
  "creator_user_id" text,
  "channel_user_id" text,
  "source_type" text not null,
  "source_id" text,
  "source_provider" text,
  "gross_amount_cents" integer default 0 not null,
  "net_amount_cents" integer default 0 not null,
  "creator_share_bps" integer,
  "platform_share_bps" integer,
  "creator_share_cents" integer default 0 not null,
  "platform_share_cents" integer default 0 not null,
  "currency" text default 'USD'::text not null,
  "status" text default 'foundation'::text not null,
  "payable_status" text default 'not_payable'::text not null,
  "payout_ledger_entry_id" bigint references public."creator_payout_ledger_entries"("id") on delete set null,
  "sponsor_deal_id" bigint references public."sponsor_deal_records"("id") on delete set null,
  "sponsor_payment_record_id" uuid references public."sponsor_payment_records"("id") on delete set null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "creator_revenue_share_ledger_entries_pkey" primary key ("id"),
  constraint "creator_revenue_share_ledger_entries_source_type_check"
    check ("source_type" in (
      'platform_served_creator_page_ad_later',
      'creator_sold_sponsor_slot_later',
      'tip_later',
      'paid_content_later',
      'manual_foundation',
      'revenue_import_later'
    )),
  constraint "creator_revenue_share_ledger_entries_source_provider_check"
    check ("source_provider" is null or "source_provider" in (
      'applovin_later',
      'stripe_later',
      'manual_foundation',
      'unknown'
    )),
  constraint "creator_revenue_share_ledger_entries_status_check"
    check ("status" in (
      'foundation',
      'draft',
      'source_money_required',
      'review_required_later',
      'held_later',
      'eligible_later',
      'cancelled'
    )),
  constraint "creator_revenue_share_ledger_entries_payable_status_check"
    check ("payable_status" in (
      'not_payable',
      'source_money_missing',
      'provider_not_connected',
      'fraud_review_required_later',
      'payout_not_active',
      'payable_later'
    )),
  constraint "creator_revenue_share_ledger_entries_amount_check"
    check (
      "gross_amount_cents" >= 0
      and "net_amount_cents" >= 0
      and "creator_share_cents" >= 0
      and "platform_share_cents" >= 0
    ),
  constraint "creator_revenue_share_ledger_entries_bps_check"
    check (
      ("creator_share_bps" is null or ("creator_share_bps" >= 0 and "creator_share_bps" <= 10000))
      and ("platform_share_bps" is null or ("platform_share_bps" >= 0 and "platform_share_bps" <= 10000))
    ),
  constraint "creator_revenue_share_ledger_entries_currency_check"
    check ("currency" ~ '^[A-Z]{3}$')
);

create table if not exists public."fraud_enforcement_policy_records" (
  "id" uuid default gen_random_uuid() not null,
  "policy_key" text not null,
  "display_name" text not null,
  "target_area" text not null,
  "action_type" text not null,
  "status" text default 'foundation'::text not null,
  "requires_audit_log" boolean default true not null,
  "requires_admin_reason" boolean default true not null,
  "requires_review" boolean default true not null,
  "requires_appeal_path" boolean default true not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "fraud_enforcement_policy_records_pkey" primary key ("id"),
  constraint "fraud_enforcement_policy_records_policy_key_key" unique ("policy_key"),
  constraint "fraud_enforcement_policy_records_target_area_check"
    check ("target_area" in (
      'payouts',
      'monetization',
      'uploads',
      'live',
      'sponsor_deals',
      'network_billing',
      'account',
      'manual_foundation'
    )),
  constraint "fraud_enforcement_policy_records_action_type_check"
    check ("action_type" in (
      'pause_payouts_later',
      'disable_monetization_later',
      'restrict_uploads_later',
      'restrict_live_later',
      'restrict_sponsor_deals_later',
      'hold_network_invoice_later',
      'restrict_account_later',
      'manual_foundation'
    )),
  constraint "fraud_enforcement_policy_records_status_check"
    check ("status" in ('foundation', 'planned', 'active_later', 'retired'))
);

alter table public."fraud_action_records"
  add column if not exists "enforcement_policy_id" uuid,
  add column if not exists "target_area" text default 'manual_foundation'::text not null,
  add column if not exists "execution_status" text default 'foundation'::text not null,
  add column if not exists "executed_at" timestamp with time zone;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fraud_action_records_enforcement_policy_fkey'
  ) then
    alter table public."fraud_action_records"
      add constraint "fraud_action_records_enforcement_policy_fkey"
        foreign key ("enforcement_policy_id") references public."fraud_enforcement_policy_records"("id") on delete set null;
  end if;
end $$;

alter table public."fraud_action_records"
  drop constraint if exists "fraud_action_records_type_check";

alter table public."fraud_action_records"
  add constraint "fraud_action_records_type_check"
  check ("action_type" in (
    'pause_payouts_later',
    'disable_monetization_later',
    'restrict_uploads_later',
    'restrict_live_later',
    'restrict_sponsor_deals_later',
    'hold_network_invoice_later',
    'restrict_account_later',
    'admin_review_required',
    'manual_foundation'
  ));

alter table public."fraud_action_records"
  drop constraint if exists "fraud_action_records_target_area_check";

alter table public."fraud_action_records"
  add constraint "fraud_action_records_target_area_check"
  check ("target_area" in (
    'payouts',
    'monetization',
    'uploads',
    'live',
    'sponsor_deals',
    'network_billing',
    'account',
    'manual_foundation'
  ));

alter table public."fraud_action_records"
  drop constraint if exists "fraud_action_records_execution_status_check";

alter table public."fraud_action_records"
  add constraint "fraud_action_records_execution_status_check"
  check ("execution_status" in (
    'foundation',
    'planned_only',
    'not_executable',
    'requires_future_approval',
    'executed_later'
  ));

create index if not exists "creator_revenue_share_ledger_entries_creator_idx"
  on public."creator_revenue_share_ledger_entries" using btree ("creator_user_id");

create index if not exists "creator_revenue_share_ledger_entries_channel_idx"
  on public."creator_revenue_share_ledger_entries" using btree ("channel_user_id");

create index if not exists "creator_revenue_share_ledger_entries_source_type_idx"
  on public."creator_revenue_share_ledger_entries" using btree ("source_type");

create index if not exists "creator_revenue_share_ledger_entries_status_idx"
  on public."creator_revenue_share_ledger_entries" using btree ("status", "created_at" desc);

create index if not exists "creator_revenue_share_ledger_entries_payable_status_idx"
  on public."creator_revenue_share_ledger_entries" using btree ("payable_status", "created_at" desc);

create index if not exists "creator_revenue_share_rules_rule_key_idx"
  on public."creator_revenue_share_rules" using btree ("rule_key");

create index if not exists "fraud_enforcement_policy_records_policy_key_idx"
  on public."fraud_enforcement_policy_records" using btree ("policy_key");

create index if not exists "fraud_enforcement_policy_records_target_area_idx"
  on public."fraud_enforcement_policy_records" using btree ("target_area");

create index if not exists "fraud_action_records_policy_idx"
  on public."fraud_action_records" using btree ("enforcement_policy_id");

create index if not exists "fraud_action_records_action_type_idx"
  on public."fraud_action_records" using btree ("action_type");

create index if not exists "fraud_action_records_execution_status_idx"
  on public."fraud_action_records" using btree ("execution_status");

alter table public."creator_revenue_share_rules" enable row level security;
alter table public."creator_revenue_share_ledger_entries" enable row level security;
alter table public."fraud_enforcement_policy_records" enable row level security;

drop policy if exists "creator_revenue_share_rules_select_owner_operator" on public."creator_revenue_share_rules";
create policy "creator_revenue_share_rules_select_owner_operator"
  on public."creator_revenue_share_rules"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_revenue_share_rules_insert_owner_operator" on public."creator_revenue_share_rules";
create policy "creator_revenue_share_rules_insert_owner_operator"
  on public."creator_revenue_share_rules"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_revenue_share_rules_update_owner_operator" on public."creator_revenue_share_rules";
create policy "creator_revenue_share_rules_update_owner_operator"
  on public."creator_revenue_share_rules"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_revenue_share_ledger_entries_select_owner_operator" on public."creator_revenue_share_ledger_entries";
create policy "creator_revenue_share_ledger_entries_select_owner_operator"
  on public."creator_revenue_share_ledger_entries"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_revenue_share_ledger_entries_insert_owner_operator" on public."creator_revenue_share_ledger_entries";
create policy "creator_revenue_share_ledger_entries_insert_owner_operator"
  on public."creator_revenue_share_ledger_entries"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_revenue_share_ledger_entries_update_owner_operator" on public."creator_revenue_share_ledger_entries";
create policy "creator_revenue_share_ledger_entries_update_owner_operator"
  on public."creator_revenue_share_ledger_entries"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "fraud_enforcement_policy_records_select_owner_operator" on public."fraud_enforcement_policy_records";
create policy "fraud_enforcement_policy_records_select_owner_operator"
  on public."fraud_enforcement_policy_records"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "fraud_enforcement_policy_records_insert_owner_operator" on public."fraud_enforcement_policy_records";
create policy "fraud_enforcement_policy_records_insert_owner_operator"
  on public."fraud_enforcement_policy_records"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "fraud_enforcement_policy_records_update_owner_operator" on public."fraud_enforcement_policy_records";
create policy "fraud_enforcement_policy_records_update_owner_operator"
  on public."fraud_enforcement_policy_records"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

revoke all on table public."creator_revenue_share_rules" from "anon";
revoke all on table public."creator_revenue_share_ledger_entries" from "anon";
revoke all on table public."fraud_enforcement_policy_records" from "anon";

grant select, insert, update on table public."creator_revenue_share_rules" to "authenticated";
grant select, insert, update on table public."creator_revenue_share_ledger_entries" to "authenticated";
grant select, insert, update on table public."fraud_enforcement_policy_records" to "authenticated";

do $$
declare
  revenue_metadata jsonb := jsonb_build_object(
    'creator_revenue_share_ledger_foundation_proof', true,
    'created_by', 'codex_creator_revenue_share_foundation',
    'foundation_only', true,
    'live_money_action', false,
    'source_money_exists', false,
    'payable_balance_created', false
  );
  fraud_metadata jsonb := jsonb_build_object(
    'fraud_hold_enforcement_foundation_proof', true,
    'created_by', 'codex_fraud_hold_enforcement_foundation',
    'foundation_only', true,
    'live_enforcement_action', false,
    'runtime_hook_connected', false
  );
  revenue_ledger_id uuid := '30f24b80-a65f-4786-97a1-1a1c7fb889f9';
  revenue_audit_id uuid := 'f8f064ce-3526-459e-b9d8-c5a0f85d6a01';
  fraud_action_id uuid := '172c2dc6-0267-4044-a88a-4c620837a505';
  fraud_audit_id uuid := '8120865b-ec63-4790-8358-8e54d08c73e6';
  fraud_hold_id bigint;
  pause_policy_id uuid := 'b071071e-d46c-4ee7-8586-b1eb746e3cb0';
begin
  insert into public."creator_revenue_share_rules" (
    "id",
    "rule_key",
    "display_name",
    "source_type",
    "creator_share_bps",
    "platform_share_bps",
    "status",
    "metadata"
  ) values
    (
      'a4529188-590c-462a-bc07-6f779974d071',
      'platform_served_creator_page_ads',
      'Platform-served creator-page ads',
      'platform_served_creator_page_ad_later',
      7000,
      3000,
      'foundation',
      revenue_metadata || jsonb_build_object('rule_foundation', true)
    ),
    (
      'e2c131c5-86cc-48f0-9f38-98dc8a83fb3b',
      'creator_sold_sponsor_slots',
      'Creator-sold sponsor slots',
      'creator_sold_sponsor_slot_later',
      8000,
      2000,
      'foundation',
      revenue_metadata || jsonb_build_object('rule_foundation', true)
    ),
    (
      '9939f56f-18ff-43fa-8dc3-f34dd50a42c2',
      'tips',
      'Tips',
      'tip_later',
      10000,
      0,
      'foundation',
      revenue_metadata || jsonb_build_object(
        'rule_foundation',
        true,
        'processing_fees_excluded',
        true
      )
    ),
    (
      'd99c3c19-d8e5-4f70-8e11-263fa5d83cc2',
      'paid_content',
      'Paid content',
      'paid_content_later',
      8000,
      2000,
      'foundation',
      revenue_metadata || jsonb_build_object('rule_foundation', true)
    )
  on conflict ("rule_key") do update set
    "display_name" = excluded."display_name",
    "source_type" = excluded."source_type",
    "creator_share_bps" = excluded."creator_share_bps",
    "platform_share_bps" = excluded."platform_share_bps",
    "status" = excluded."status",
    "metadata" = excluded."metadata",
    "updated_at" = timezone('utc'::text, now());

  insert into public."creator_revenue_share_ledger_entries" (
    "id",
    "source_type",
    "source_id",
    "source_provider",
    "gross_amount_cents",
    "net_amount_cents",
    "creator_share_bps",
    "platform_share_bps",
    "creator_share_cents",
    "platform_share_cents",
    "currency",
    "status",
    "payable_status",
    "metadata"
  ) values (
    revenue_ledger_id,
    'manual_foundation',
    'creator_revenue_share_foundation_proof',
    'manual_foundation',
    0,
    0,
    null,
    null,
    0,
    0,
    'USD',
    'foundation',
    'not_payable',
    revenue_metadata
  )
  on conflict ("id") do update set
    "gross_amount_cents" = excluded."gross_amount_cents",
    "net_amount_cents" = excluded."net_amount_cents",
    "creator_share_cents" = excluded."creator_share_cents",
    "platform_share_cents" = excluded."platform_share_cents",
    "status" = excluded."status",
    "payable_status" = excluded."payable_status",
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
    revenue_audit_id,
    'foundation',
    'creator_revenue_share_foundation_recorded',
    'finance',
    'creator_revenue_share_ledger_entries',
    revenue_ledger_id::text,
    'Creator revenue share ledger foundation proof only; no source money, earnings, payable balance, or payout ledger entry was created.',
    revenue_metadata
  where not exists (
    select 1
    from public."platform_admin_audit_logs"
    where "id" = revenue_audit_id
  );

  insert into public."fraud_enforcement_policy_records" (
    "id",
    "policy_key",
    "display_name",
    "target_area",
    "action_type",
    "status",
    "requires_audit_log",
    "requires_admin_reason",
    "requires_review",
    "requires_appeal_path",
    "metadata"
  ) values
    (
      pause_policy_id,
      'pause_payouts_later',
      'Pause payouts later',
      'payouts',
      'pause_payouts_later',
      'foundation',
      true,
      true,
      true,
      true,
      fraud_metadata
    ),
    (
      '4b728e28-4259-4f07-b463-e0862f708723',
      'disable_monetization_later',
      'Disable monetization later',
      'monetization',
      'disable_monetization_later',
      'foundation',
      true,
      true,
      true,
      true,
      fraud_metadata
    ),
    (
      '9cbe80cd-8d15-45a5-902d-7f54f51e470d',
      'restrict_uploads_later',
      'Restrict uploads later',
      'uploads',
      'restrict_uploads_later',
      'foundation',
      true,
      true,
      true,
      true,
      fraud_metadata
    ),
    (
      'ae3e3450-392c-43f8-a195-3f5797d6ea26',
      'restrict_live_later',
      'Restrict live later',
      'live',
      'restrict_live_later',
      'foundation',
      true,
      true,
      true,
      true,
      fraud_metadata
    ),
    (
      'f014a1e2-1f15-4893-baa6-37d005316f7f',
      'restrict_sponsor_deals_later',
      'Restrict sponsor deals later',
      'sponsor_deals',
      'restrict_sponsor_deals_later',
      'foundation',
      true,
      true,
      true,
      true,
      fraud_metadata
    )
  on conflict ("policy_key") do update set
    "display_name" = excluded."display_name",
    "target_area" = excluded."target_area",
    "action_type" = excluded."action_type",
    "status" = excluded."status",
    "requires_audit_log" = excluded."requires_audit_log",
    "requires_admin_reason" = excluded."requires_admin_reason",
    "requires_review" = excluded."requires_review",
    "requires_appeal_path" = excluded."requires_appeal_path",
    "metadata" = excluded."metadata",
    "updated_at" = timezone('utc'::text, now());

  select "id"
  into fraud_hold_id
  from public."platform_fraud_holds"
  where "metadata"->>'created_by' = 'codex_fraud_hold_enforcement_foundation'
  order by "created_at" asc
  limit 1;

  if fraud_hold_id is null then
    insert into public."platform_fraud_holds" (
      "target_type",
      "target_id",
      "user_id",
      "reason",
      "status",
      "enforcement_scope",
      "created_by_user_id",
      "target_user_id",
      "target_channel_user_id",
      "severity",
      "primary_reason",
      "notes",
      "metadata"
    ) values (
      'manual_foundation',
      'fraud_hold_enforcement_foundation',
      null,
      'manual_foundation',
      'foundation',
      'foundation_only',
      null,
      null,
      null,
      'foundation',
      'manual_foundation',
      'Fraud hold enforcement foundation proof only; no runtime hook is connected.',
      fraud_metadata
    )
    returning "id" into fraud_hold_id;
  end if;

  insert into public."fraud_action_records" (
    "id",
    "fraud_hold_id",
    "action_type",
    "status",
    "reason",
    "enforcement_policy_id",
    "target_area",
    "execution_status",
    "metadata"
  ) values (
    fraud_action_id,
    fraud_hold_id,
    'pause_payouts_later',
    'foundation',
    'Fraud hold enforcement foundation proof only; payout pause is not executable.',
    pause_policy_id,
    'payouts',
    'not_executable',
    fraud_metadata
  )
  on conflict ("id") do update set
    "fraud_hold_id" = excluded."fraud_hold_id",
    "action_type" = excluded."action_type",
    "status" = excluded."status",
    "reason" = excluded."reason",
    "enforcement_policy_id" = excluded."enforcement_policy_id",
    "target_area" = excluded."target_area",
    "execution_status" = excluded."execution_status",
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
    fraud_audit_id,
    'foundation',
    'fraud_hold_enforcement_foundation_recorded',
    'fraud',
    'fraud_action_records',
    fraud_action_id::text,
    'Fraud hold enforcement foundation proof only; no payout pause, monetization disable, upload restriction, live restriction, sponsor restriction, or account restriction executed.',
    fraud_metadata
  where not exists (
    select 1
    from public."platform_admin_audit_logs"
    where "id" = fraud_audit_id
  );
end $$;
