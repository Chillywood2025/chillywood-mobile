create table if not exists public."platform_admin_audit_logs" (
  "id" uuid default gen_random_uuid() not null,
  "actor_user_id" text,
  "actor_email" text,
  "actor_role" text,
  "action" text not null,
  "action_category" text not null,
  "target_type" text,
  "target_id" text,
  "target_user_id" text,
  "target_channel_user_id" text,
  "reason" text,
  "severity" text default 'info'::text not null,
  "before_state" jsonb,
  "after_state" jsonb,
  "metadata" jsonb default '{}'::jsonb not null,
  "ip_hash" text,
  "user_agent_hash" text,
  "request_id" text,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "platform_admin_audit_logs_pkey" primary key ("id"),
  constraint "platform_admin_audit_logs_action_category_check"
    check ("action_category" in (
      'admin_access',
      'moderation',
      'content',
      'finance',
      'payout',
      'network_billing',
      'sponsor',
      'fraud',
      'ads',
      'usage',
      'system',
      'role',
      'settings',
      'foundation'
    )),
  constraint "platform_admin_audit_logs_severity_check"
    check ("severity" in ('info', 'notice', 'warning', 'critical'))
);

create index if not exists "platform_admin_audit_logs_created_at_idx"
  on public."platform_admin_audit_logs" using btree ("created_at" desc);

create index if not exists "platform_admin_audit_logs_actor_user_idx"
  on public."platform_admin_audit_logs" using btree ("actor_user_id");

create index if not exists "platform_admin_audit_logs_action_category_idx"
  on public."platform_admin_audit_logs" using btree ("action_category");

create index if not exists "platform_admin_audit_logs_action_idx"
  on public."platform_admin_audit_logs" using btree ("action");

create index if not exists "platform_admin_audit_logs_target_idx"
  on public."platform_admin_audit_logs" using btree ("target_type", "target_id");

create index if not exists "platform_admin_audit_logs_target_user_idx"
  on public."platform_admin_audit_logs" using btree ("target_user_id");

create index if not exists "platform_admin_audit_logs_target_channel_user_idx"
  on public."platform_admin_audit_logs" using btree ("target_channel_user_id");

alter table public."platform_admin_audit_logs" enable row level security;

drop policy if exists "platform_admin_audit_logs_select_owner_operator" on public."platform_admin_audit_logs";
create policy "platform_admin_audit_logs_select_owner_operator"
  on public."platform_admin_audit_logs"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "platform_admin_audit_logs_insert_owner_operator" on public."platform_admin_audit_logs";
create policy "platform_admin_audit_logs_insert_owner_operator"
  on public."platform_admin_audit_logs"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

revoke all on table public."platform_admin_audit_logs" from "anon";
revoke update, delete on table public."platform_admin_audit_logs" from "authenticated";
grant select, insert on table public."platform_admin_audit_logs" to "authenticated";

create or replace function public.prevent_platform_admin_audit_log_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'platform_admin_audit_logs is append-only';
end;
$$;

drop trigger if exists "prevent_platform_admin_audit_log_mutation" on public."platform_admin_audit_logs";
create trigger "prevent_platform_admin_audit_log_mutation"
  before update or delete on public."platform_admin_audit_logs"
  for each row execute function public.prevent_platform_admin_audit_log_mutation();

do $$
declare
  proof_metadata jsonb := jsonb_build_object(
    'admin_audit_foundation_proof', true,
    'created_by', 'codex_admin_audit_foundation',
    'foundation_only', true,
    'live_action', false
  );
begin
  insert into public."platform_admin_audit_logs" (
    "actor_role",
    "action",
    "action_category",
    "target_type",
    "reason",
    "metadata"
  )
  select
    'foundation',
    'foundation_proof_created',
    'foundation',
    'platform_admin_audit_logs',
    'Immutable admin audit log foundation proof row only. No dangerous admin action executed.',
    proof_metadata || jsonb_build_object(
      'append_only_foundation', true,
      'dangerous_action_executed', false
    )
  where not exists (
    select 1
      from public."platform_admin_audit_logs"
      where "action" = 'foundation_proof_created'
        and "metadata"->>'created_by' = 'codex_admin_audit_foundation'
  );

  insert into public."platform_admin_audit_logs" (
    "actor_role",
    "action",
    "action_category",
    "target_type",
    "reason",
    "metadata"
  )
  select
    'foundation',
    'finance_foundation_recorded',
    'finance',
    'platform_finance_ledger_events',
    'Finance foundation recorded for audit readiness only. No money movement or payout approval executed.',
    proof_metadata || jsonb_build_object(
      'money_movement_executed', false,
      'payout_approval_executed', false
    )
  where not exists (
    select 1
      from public."platform_admin_audit_logs"
      where "action" = 'finance_foundation_recorded'
        and "metadata"->>'created_by' = 'codex_admin_audit_foundation'
  );

  insert into public."platform_admin_audit_logs" (
    "actor_role",
    "action",
    "action_category",
    "target_type",
    "reason",
    "metadata"
  )
  select
    'foundation',
    'fraud_enforcement_foundation_recorded',
    'fraud',
    'platform_fraud_holds',
    'Fraud enforcement foundation recorded for audit readiness only. No enforcement action executed.',
    proof_metadata || jsonb_build_object(
      'fraud_enforcement_executed', false,
      'risk_score_created', false
    )
  where not exists (
    select 1
      from public."platform_admin_audit_logs"
      where "action" = 'fraud_enforcement_foundation_recorded'
        and "metadata"->>'created_by' = 'codex_admin_audit_foundation'
  );

  insert into public."platform_admin_audit_logs" (
    "actor_role",
    "action",
    "action_category",
    "target_type",
    "reason",
    "metadata"
  )
  select
    'foundation',
    'network_billing_foundation_recorded',
    'network_billing',
    'network_billing_accounts',
    'Network billing foundation recorded for audit readiness only. No invoice send or customer charge executed.',
    proof_metadata || jsonb_build_object(
      'invoice_sent', false,
      'customer_charged', false
    )
  where not exists (
    select 1
      from public."platform_admin_audit_logs"
      where "action" = 'network_billing_foundation_recorded'
        and "metadata"->>'created_by' = 'codex_admin_audit_foundation'
  );

  insert into public."platform_admin_audit_logs" (
    "actor_role",
    "action",
    "action_category",
    "target_type",
    "reason",
    "metadata"
  )
  select
    'foundation',
    'sponsor_checkout_foundation_recorded',
    'sponsor',
    'sponsor_deal_records',
    'Sponsor checkout foundation recorded for audit readiness only. No checkout, payment link, or sponsor approval executed.',
    proof_metadata || jsonb_build_object(
      'sponsor_checkout_created', false,
      'payment_link_created', false,
      'sponsor_approval_executed', false
    )
  where not exists (
    select 1
      from public."platform_admin_audit_logs"
      where "action" = 'sponsor_checkout_foundation_recorded'
        and "metadata"->>'created_by' = 'codex_admin_audit_foundation'
  );
end;
$$;
