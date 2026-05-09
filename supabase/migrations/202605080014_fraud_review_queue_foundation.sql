create table if not exists public."fraud_review_queue_records" (
  "id" uuid default gen_random_uuid() not null,
  "fraud_hold_id" bigint references public."platform_fraud_holds"("id") on delete set null,
  "target_user_id" text,
  "target_channel_user_id" text,
  "review_status" text default 'foundation'::text not null,
  "review_type" text default 'manual_foundation'::text not null,
  "priority" text default 'normal'::text not null,
  "assigned_to_user_id" text,
  "review_reason" text,
  "review_notes" text,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "fraud_review_queue_records_pkey" primary key ("id"),
  constraint "fraud_review_queue_records_status_check"
    check ("review_status" in (
      'foundation',
      'pending_review_later',
      'needs_evidence_later',
      'escalated_later',
      'cleared_later',
      'enforcement_planned_later',
      'appealed_later',
      'cancelled'
    )),
  constraint "fraud_review_queue_records_type_check"
    check ("review_type" in (
      'fraud_hold_review',
      'payout_hold_review_later',
      'monetization_review_later',
      'upload_review_later',
      'live_review_later',
      'sponsor_review_later',
      'network_billing_review_later',
      'manual_foundation'
    )),
  constraint "fraud_review_queue_records_priority_check"
    check ("priority" in ('low', 'normal', 'high', 'urgent_later'))
);

create index if not exists "fraud_review_queue_records_hold_idx"
  on public."fraud_review_queue_records" using btree ("fraud_hold_id");

create index if not exists "fraud_review_queue_records_status_idx"
  on public."fraud_review_queue_records" using btree ("review_status", "created_at" desc);

create index if not exists "fraud_review_queue_records_type_idx"
  on public."fraud_review_queue_records" using btree ("review_type", "created_at" desc);

create index if not exists "fraud_review_queue_records_target_user_idx"
  on public."fraud_review_queue_records" using btree ("target_user_id");

create index if not exists "fraud_review_queue_records_target_channel_idx"
  on public."fraud_review_queue_records" using btree ("target_channel_user_id");

alter table public."fraud_review_queue_records" enable row level security;

drop policy if exists "fraud_review_queue_records_select_owner_operator"
  on public."fraud_review_queue_records";
create policy "fraud_review_queue_records_select_owner_operator"
  on public."fraud_review_queue_records"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "fraud_review_queue_records_insert_owner_operator"
  on public."fraud_review_queue_records";
create policy "fraud_review_queue_records_insert_owner_operator"
  on public."fraud_review_queue_records"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "fraud_review_queue_records_update_owner_operator"
  on public."fraud_review_queue_records";
create policy "fraud_review_queue_records_update_owner_operator"
  on public."fraud_review_queue_records"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

revoke all on table public."fraud_review_queue_records" from "anon";
grant select, insert, update on table public."fraud_review_queue_records" to "authenticated";

do $$
declare
  fraud_hold_id bigint;
  queue_record_id uuid := 'c9e89b84-8429-4c03-949a-29cd2c7d6f01';
  review_note_id uuid := 'dc50d9f7-0db1-421c-a73d-2c08788e6a80';
  audit_id uuid := '1f70e17b-f008-4b2b-a978-14707221ecdf';
  proof_metadata jsonb := jsonb_build_object(
    'fraud_review_queue_foundation_proof', true,
    'created_by', 'codex_fraud_review_queue_foundation',
    'foundation_only', true,
    'live_enforcement_action', false,
    'payout_pause_executed', false,
    'monetization_disabled', false,
    'upload_restricted', false,
    'live_restricted', false,
    'sponsor_restricted', false,
    'account_restricted', false,
    'fake_risk_score', false
  );
begin
  select "id"
  into fraud_hold_id
  from public."platform_fraud_holds"
  where "metadata"->>'created_by' in (
    'codex_fraud_hold_enforcement_foundation',
    'codex_fraud_enforcement_foundation'
  )
  order by "created_at" asc
  limit 1;

  if fraud_hold_id is null then
    insert into public."platform_fraud_holds" (
      "target_type",
      "target_id",
      "reason",
      "status",
      "enforcement_scope",
      "severity",
      "primary_reason",
      "notes",
      "metadata"
    ) values (
      'manual_foundation',
      'fraud_review_queue_foundation',
      'manual_foundation',
      'foundation',
      'foundation_only',
      'foundation',
      'manual_foundation',
      'Fraud review queue foundation proof only; no runtime enforcement hook is connected.',
      proof_metadata
    )
    returning "id" into fraud_hold_id;
  end if;

  insert into public."fraud_review_queue_records" (
    "id",
    "fraud_hold_id",
    "review_status",
    "review_type",
    "priority",
    "review_reason",
    "review_notes",
    "metadata"
  ) values (
    queue_record_id,
    fraud_hold_id,
    'foundation',
    'manual_foundation',
    'normal',
    'manual_foundation',
    'Fraud review queue foundation proof only. No enforcement action is executable from this row.',
    proof_metadata
  )
  on conflict ("id") do update set
    "fraud_hold_id" = excluded."fraud_hold_id",
    "review_status" = excluded."review_status",
    "review_type" = excluded."review_type",
    "priority" = excluded."priority",
    "review_reason" = excluded."review_reason",
    "review_notes" = excluded."review_notes",
    "metadata" = excluded."metadata",
    "updated_at" = timezone('utc'::text, now());

  insert into public."fraud_review_notes" (
    "id",
    "fraud_hold_id",
    "note",
    "review_status",
    "metadata"
  ) values (
    review_note_id,
    fraud_hold_id,
    'Fraud review queue foundation proof note. Review queue is read-only/foundation and enforcement is not active.',
    'foundation',
    proof_metadata || jsonb_build_object('review_queue_active', false)
  )
  on conflict ("id") do nothing;

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
    'fraud_review_queue_foundation_recorded',
    'fraud',
    'fraud_review_queue_records',
    queue_record_id::text,
    'Fraud review queue foundation proof only; no payout pause, monetization disable, upload restriction, live restriction, sponsor restriction, account restriction, strike, ban, or risk score was executed.',
    proof_metadata
  where not exists (
    select 1
    from public."platform_admin_audit_logs"
    where "id" = audit_id
  );
end $$;
