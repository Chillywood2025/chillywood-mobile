alter table public."platform_fraud_holds"
  add column if not exists "target_user_id" text,
  add column if not exists "target_channel_user_id" text,
  add column if not exists "severity" text default 'foundation'::text not null,
  add column if not exists "primary_reason" text default 'manual_foundation'::text not null,
  add column if not exists "notes" text;

alter table public."platform_fraud_holds"
  drop constraint if exists "platform_fraud_holds_target_type_check";

alter table public."platform_fraud_holds"
  add constraint "platform_fraud_holds_target_type_check"
  check (
    "target_type" in (
      'user',
      'channel',
      'content',
      'creator_video',
      'ledger_event',
      'payout_entry',
      'payout',
      'sponsor_deal',
      'network_account',
      'ad_activity',
      'usage_activity',
      'manual_foundation',
      'unknown'
    )
  );

alter table public."platform_fraud_holds"
  drop constraint if exists "platform_fraud_holds_status_check";

alter table public."platform_fraud_holds"
  add constraint "platform_fraud_holds_status_check"
  check (
    "status" in (
      'foundation',
      'draft',
      'under_review_later',
      'active_later',
      'limited_later',
      'released_later',
      'escalated_later',
      'resolved_later',
      'rejected',
      'appealed_later',
      'active',
      'released',
      'expired'
    )
  );

alter table public."platform_fraud_holds"
  drop constraint if exists "platform_fraud_holds_scope_check";

alter table public."platform_fraud_holds"
  add constraint "platform_fraud_holds_scope_check"
  check (
    "enforcement_scope" in (
      'foundation_only',
      'payout_review_later',
      'monetization_review_later',
      'upload_review_later',
      'live_review_later',
      'network_billing_review_later',
      'sponsor_review_later',
      'payouts_later',
      'monetization_later',
      'uploads_live_later'
    )
  );

alter table public."platform_fraud_holds"
  drop constraint if exists "platform_fraud_holds_severity_check";

alter table public."platform_fraud_holds"
  add constraint "platform_fraud_holds_severity_check"
  check ("severity" in ('foundation', 'low_later', 'medium_later', 'high_later', 'critical_later'));

alter table public."platform_fraud_holds"
  drop constraint if exists "platform_fraud_holds_primary_reason_check";

alter table public."platform_fraud_holds"
  add constraint "platform_fraud_holds_primary_reason_check"
  check (
    "primary_reason" in (
      'invalid_traffic',
      'fake_engagement',
      'fake_followers',
      'fake_views',
      'fake_ad_activity',
      'scams',
      'undisclosed_sponsorship',
      'stolen_content',
      'chargebacks',
      'refund_abuse',
      'policy_violation',
      'illegal_conduct',
      'suspicious_payout_behavior',
      'network_overage_abuse',
      'manual_foundation'
    )
  );

create table if not exists public."fraud_reason_records" (
  "id" uuid default gen_random_uuid() not null,
  "reason_key" text not null,
  "display_name" text not null,
  "description" text,
  "status" text default 'foundation'::text not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "fraud_reason_records_pkey" primary key ("id"),
  constraint "fraud_reason_records_reason_key_key" unique ("reason_key"),
  constraint "fraud_reason_records_status_check"
    check ("status" in ('foundation', 'active_later', 'retired'))
);

create table if not exists public."fraud_evidence_records" (
  "id" uuid default gen_random_uuid() not null,
  "fraud_hold_id" bigint not null,
  "evidence_type" text not null,
  "title" text,
  "description" text,
  "source_table" text,
  "source_id" text,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "fraud_evidence_records_pkey" primary key ("id"),
  constraint "fraud_evidence_records_hold_fkey"
    foreign key ("fraud_hold_id") references public."platform_fraud_holds"("id") on delete cascade,
  constraint "fraud_evidence_records_type_check"
    check ("evidence_type" in (
      'usage_spike',
      'provider_variance',
      'report',
      'chargeback_later',
      'copyright_claim',
      'sponsor_disclosure_gap',
      'manual_note',
      'admin_observation',
      'manual_foundation'
    ))
);

create table if not exists public."fraud_action_records" (
  "id" uuid default gen_random_uuid() not null,
  "fraud_hold_id" bigint not null,
  "action_type" text not null,
  "status" text default 'foundation'::text not null,
  "reason" text,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "fraud_action_records_pkey" primary key ("id"),
  constraint "fraud_action_records_hold_fkey"
    foreign key ("fraud_hold_id") references public."platform_fraud_holds"("id") on delete cascade,
  constraint "fraud_action_records_type_check"
    check ("action_type" in (
      'pause_payouts_later',
      'disable_monetization_later',
      'restrict_uploads_later',
      'restrict_live_later',
      'restrict_sponsor_deals_later',
      'hold_network_invoice_later',
      'admin_review_required',
      'manual_foundation'
    )),
  constraint "fraud_action_records_status_check"
    check ("status" in ('foundation', 'draft', 'review_required_later', 'approved_later', 'rejected', 'cancelled'))
);

create table if not exists public."fraud_review_notes" (
  "id" uuid default gen_random_uuid() not null,
  "fraud_hold_id" bigint not null,
  "actor_user_id" text,
  "note" text not null,
  "review_status" text default 'foundation'::text not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "fraud_review_notes_pkey" primary key ("id"),
  constraint "fraud_review_notes_hold_fkey"
    foreign key ("fraud_hold_id") references public."platform_fraud_holds"("id") on delete cascade,
  constraint "fraud_review_notes_status_check"
    check ("review_status" in ('foundation', 'needs_review_later', 'reviewed_later', 'escalated_later'))
);

create table if not exists public."fraud_appeal_records" (
  "id" uuid default gen_random_uuid() not null,
  "fraud_hold_id" bigint not null,
  "submitted_by_user_id" text,
  "status" text default 'foundation'::text not null,
  "message" text,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "fraud_appeal_records_pkey" primary key ("id"),
  constraint "fraud_appeal_records_hold_fkey"
    foreign key ("fraud_hold_id") references public."platform_fraud_holds"("id") on delete cascade,
  constraint "fraud_appeal_records_status_check"
    check ("status" in ('foundation', 'not_active', 'submitted_later', 'under_review_later', 'accepted_later', 'denied_later', 'closed_later'))
);

create table if not exists public."fraud_audit_logs" (
  "id" uuid default gen_random_uuid() not null,
  "fraud_hold_id" bigint,
  "actor_user_id" text,
  "action" text not null,
  "target_table" text,
  "target_id" text,
  "reason" text,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "fraud_audit_logs_pkey" primary key ("id"),
  constraint "fraud_audit_logs_hold_fkey"
    foreign key ("fraud_hold_id") references public."platform_fraud_holds"("id") on delete set null,
  constraint "fraud_audit_logs_action_check"
    check ("action" in (
      'foundation_proof_created',
      'hold_drafted',
      'evidence_added',
      'review_note_added',
      'action_planned',
      'appeal_placeholder_created',
      'manual_note'
    ))
);

create index if not exists "platform_fraud_holds_status_idx"
  on public."platform_fraud_holds" using btree ("status");

create index if not exists "platform_fraud_holds_target_idx"
  on public."platform_fraud_holds" using btree ("target_type", "target_id");

create index if not exists "platform_fraud_holds_target_user_idx"
  on public."platform_fraud_holds" using btree ("target_user_id");

create index if not exists "fraud_reason_records_reason_key_idx"
  on public."fraud_reason_records" using btree ("reason_key");

create index if not exists "fraud_evidence_records_hold_idx"
  on public."fraud_evidence_records" using btree ("fraud_hold_id");

create index if not exists "fraud_action_records_hold_idx"
  on public."fraud_action_records" using btree ("fraud_hold_id");

create index if not exists "fraud_review_notes_hold_created_idx"
  on public."fraud_review_notes" using btree ("fraud_hold_id", "created_at" desc);

create index if not exists "fraud_appeal_records_hold_status_idx"
  on public."fraud_appeal_records" using btree ("fraud_hold_id", "status");

create index if not exists "fraud_audit_logs_hold_created_idx"
  on public."fraud_audit_logs" using btree ("fraud_hold_id", "created_at" desc);

alter table public."fraud_reason_records" enable row level security;
alter table public."fraud_evidence_records" enable row level security;
alter table public."fraud_action_records" enable row level security;
alter table public."fraud_review_notes" enable row level security;
alter table public."fraud_appeal_records" enable row level security;
alter table public."fraud_audit_logs" enable row level security;

drop policy if exists "fraud_reason_records_select_owner_operator" on public."fraud_reason_records";
create policy "fraud_reason_records_select_owner_operator"
  on public."fraud_reason_records"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "fraud_reason_records_insert_owner_operator" on public."fraud_reason_records";
create policy "fraud_reason_records_insert_owner_operator"
  on public."fraud_reason_records"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "fraud_reason_records_update_owner_operator" on public."fraud_reason_records";
create policy "fraud_reason_records_update_owner_operator"
  on public."fraud_reason_records"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "fraud_evidence_records_select_owner_operator" on public."fraud_evidence_records";
create policy "fraud_evidence_records_select_owner_operator"
  on public."fraud_evidence_records"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "fraud_evidence_records_insert_owner_operator" on public."fraud_evidence_records";
create policy "fraud_evidence_records_insert_owner_operator"
  on public."fraud_evidence_records"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "fraud_evidence_records_update_owner_operator" on public."fraud_evidence_records";
create policy "fraud_evidence_records_update_owner_operator"
  on public."fraud_evidence_records"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "fraud_action_records_select_owner_operator" on public."fraud_action_records";
create policy "fraud_action_records_select_owner_operator"
  on public."fraud_action_records"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "fraud_action_records_insert_owner_operator" on public."fraud_action_records";
create policy "fraud_action_records_insert_owner_operator"
  on public."fraud_action_records"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "fraud_action_records_update_owner_operator" on public."fraud_action_records";
create policy "fraud_action_records_update_owner_operator"
  on public."fraud_action_records"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "fraud_review_notes_select_owner_operator" on public."fraud_review_notes";
create policy "fraud_review_notes_select_owner_operator"
  on public."fraud_review_notes"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "fraud_review_notes_insert_owner_operator" on public."fraud_review_notes";
create policy "fraud_review_notes_insert_owner_operator"
  on public."fraud_review_notes"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "fraud_appeal_records_select_owner_operator" on public."fraud_appeal_records";
create policy "fraud_appeal_records_select_owner_operator"
  on public."fraud_appeal_records"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "fraud_appeal_records_insert_owner_operator" on public."fraud_appeal_records";
create policy "fraud_appeal_records_insert_owner_operator"
  on public."fraud_appeal_records"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "fraud_appeal_records_update_owner_operator" on public."fraud_appeal_records";
create policy "fraud_appeal_records_update_owner_operator"
  on public."fraud_appeal_records"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "fraud_audit_logs_select_owner_operator" on public."fraud_audit_logs";
create policy "fraud_audit_logs_select_owner_operator"
  on public."fraud_audit_logs"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "fraud_audit_logs_insert_owner_operator" on public."fraud_audit_logs";
create policy "fraud_audit_logs_insert_owner_operator"
  on public."fraud_audit_logs"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

grant select, insert, update on table public."fraud_reason_records" to "authenticated";
grant select, insert, update on table public."fraud_evidence_records" to "authenticated";
grant select, insert, update on table public."fraud_action_records" to "authenticated";
grant select, insert on table public."fraud_review_notes" to "authenticated";
grant select, insert, update on table public."fraud_appeal_records" to "authenticated";
grant select, insert on table public."fraud_audit_logs" to "authenticated";

do $$
declare
  proof_metadata jsonb := jsonb_build_object(
    'fraud_enforcement_foundation_proof', true,
    'created_by', 'codex_fraud_enforcement_foundation',
    'foundation_only', true,
    'live_enforcement_action', false
  );
  proof_hold_metadata jsonb := proof_metadata || jsonb_build_object(
    'account_restriction_active', false,
    'payout_pause_active', false,
    'upload_restriction_active', false,
    'live_restriction_active', false,
    'monetization_disable_active', false,
    'risk_score_active', false
  );
  foundation_hold_id bigint;
begin
  insert into public."fraud_reason_records" (
    "reason_key",
    "display_name",
    "description",
    "status",
    "metadata"
  )
  values
    ('invalid_traffic', 'Invalid traffic', 'Future review reason for non-human, manipulated, or low-integrity traffic signals.', 'foundation', proof_metadata),
    ('fake_engagement', 'Fake engagement', 'Future review reason for manipulated likes, follows, comments, or watch behavior.', 'foundation', proof_metadata),
    ('fake_followers', 'Fake followers', 'Future review reason for suspicious follower or audience growth patterns.', 'foundation', proof_metadata),
    ('fake_views', 'Fake views', 'Future review reason for manipulated view counts or watch sessions.', 'foundation', proof_metadata),
    ('fake_ad_activity', 'Fake ad activity', 'Future review reason for ad integrity concerns.', 'foundation', proof_metadata),
    ('scams', 'Scams', 'Future review reason for scams, fake offers, or deceptive monetization behavior.', 'foundation', proof_metadata),
    ('undisclosed_sponsorship', 'Undisclosed sponsorship', 'Future review reason for missing paid partnership disclosure.', 'foundation', proof_metadata),
    ('stolen_content', 'Stolen content', 'Future review reason for rights or ownership concerns.', 'foundation', proof_metadata),
    ('chargebacks', 'Chargebacks', 'Future review reason for payment dispute patterns.', 'foundation', proof_metadata),
    ('refund_abuse', 'Refund abuse', 'Future review reason for refund misuse patterns.', 'foundation', proof_metadata),
    ('policy_violation', 'Policy violation', 'Future review reason for platform policy violations.', 'foundation', proof_metadata),
    ('illegal_conduct', 'Illegal conduct', 'Future review reason for legal or law-enforcement-sensitive concerns.', 'foundation', proof_metadata),
    ('suspicious_payout_behavior', 'Suspicious payout behavior', 'Future review reason for payout integrity concerns.', 'foundation', proof_metadata),
    ('network_overage_abuse', 'Network overage abuse', 'Future review reason for network usage or billing abuse concerns.', 'foundation', proof_metadata),
    ('manual_foundation', 'Manual foundation', 'Foundation-only proof reason. No live enforcement action is connected.', 'foundation', proof_metadata)
  on conflict ("reason_key") do update
    set
      "display_name" = excluded."display_name",
      "description" = excluded."description",
      "status" = excluded."status",
      "metadata" = public."fraud_reason_records"."metadata" || excluded."metadata",
      "updated_at" = timezone('utc'::text, now());

  select "id"
    into foundation_hold_id
    from public."platform_fraud_holds"
    where "metadata"->>'created_by' = 'codex_fraud_enforcement_foundation'
    limit 1;

  if foundation_hold_id is null then
    insert into public."platform_fraud_holds" (
      "target_type",
      "target_id",
      "user_id",
      "target_user_id",
      "target_channel_user_id",
      "reason",
      "status",
      "enforcement_scope",
      "severity",
      "primary_reason",
      "notes",
      "metadata"
    )
    values (
      'manual_foundation',
      null,
      null,
      null,
      null,
      'manual_foundation',
      'foundation',
      'foundation_only',
      'foundation',
      'manual_foundation',
      'Fraud enforcement foundation proof row only; no user, channel, payout, upload, live, or monetization restriction.',
      proof_hold_metadata
    )
    returning "id" into foundation_hold_id;
  else
    update public."platform_fraud_holds"
      set
        "target_type" = 'manual_foundation',
        "target_id" = null,
        "user_id" = null,
        "target_user_id" = null,
        "target_channel_user_id" = null,
        "reason" = 'manual_foundation',
        "status" = 'foundation',
        "enforcement_scope" = 'foundation_only',
        "severity" = 'foundation',
        "primary_reason" = 'manual_foundation',
        "notes" = 'Fraud enforcement foundation proof row only; no user, channel, payout, upload, live, or monetization restriction.',
        "metadata" = "metadata" || proof_hold_metadata,
        "updated_at" = timezone('utc'::text, now())
      where "id" = foundation_hold_id;
  end if;

  insert into public."fraud_evidence_records" (
    "fraud_hold_id",
    "evidence_type",
    "title",
    "description",
    "metadata"
  )
  select
    foundation_hold_id,
    'manual_foundation',
    'Fraud Enforcement Foundation Evidence',
    'Manual proof note only. No sensitive raw evidence, private content, or secrets are stored here.',
    proof_metadata || jsonb_build_object('sensitive_raw_evidence_stored', false)
  where not exists (
    select 1
      from public."fraud_evidence_records"
      where "fraud_hold_id" = foundation_hold_id
        and "metadata"->>'created_by' = 'codex_fraud_enforcement_foundation'
  );

  insert into public."fraud_action_records" (
    "fraud_hold_id",
    "action_type",
    "status",
    "reason",
    "metadata"
  )
  select
    foundation_hold_id,
    'manual_foundation',
    'foundation',
    'Foundation action placeholder only; no payout pause, account restriction, upload/live restriction, or monetization disable executes.',
    proof_metadata || jsonb_build_object(
      'action_executes', false,
      'dangerous_action_confirmation_required_later', true
    )
  where not exists (
    select 1
      from public."fraud_action_records"
      where "fraud_hold_id" = foundation_hold_id
        and "metadata"->>'created_by' = 'codex_fraud_enforcement_foundation'
  );

  insert into public."fraud_review_notes" (
    "fraud_hold_id",
    "note",
    "review_status",
    "metadata"
  )
  select
    foundation_hold_id,
    'Fraud enforcement foundation proof note. Review workflow is not connected yet.',
    'foundation',
    proof_metadata || jsonb_build_object('review_workflow_active', false)
  where not exists (
    select 1
      from public."fraud_review_notes"
      where "fraud_hold_id" = foundation_hold_id
        and "metadata"->>'created_by' = 'codex_fraud_enforcement_foundation'
  );

  insert into public."fraud_appeal_records" (
    "fraud_hold_id",
    "status",
    "message",
    "metadata"
  )
  select
    foundation_hold_id,
    'not_active',
    'Appeal placeholder only. User appeal UI and appeal workflow are not active yet.',
    proof_metadata || jsonb_build_object('appeals_active', false)
  where not exists (
    select 1
      from public."fraud_appeal_records"
      where "fraud_hold_id" = foundation_hold_id
        and "metadata"->>'created_by' = 'codex_fraud_enforcement_foundation'
  );

  insert into public."fraud_audit_logs" (
    "fraud_hold_id",
    "action",
    "target_table",
    "target_id",
    "reason",
    "metadata"
  )
  select
    foundation_hold_id,
    'foundation_proof_created',
    'platform_fraud_holds',
    foundation_hold_id::text,
    'Fraud enforcement foundation proof row created. No live enforcement action.',
    proof_metadata || jsonb_build_object('immutable_admin_audit_log_required_later', true)
  where not exists (
    select 1
      from public."fraud_audit_logs"
      where "fraud_hold_id" = foundation_hold_id
        and "metadata"->>'created_by' = 'codex_fraud_enforcement_foundation'
  );
end;
$$;
