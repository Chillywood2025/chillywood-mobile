alter table public."sponsor_disclosure_records"
  add column if not exists "required_before_live" boolean default true not null;

alter table public."sponsor_disclosure_records"
  drop constraint if exists "sponsor_disclosure_records_status_check";

alter table public."sponsor_disclosure_records"
  add constraint "sponsor_disclosure_records_status_check"
  check ("status" in (
    'foundation',
    'draft',
    'required_later',
    'approved_later',
    'missing_later',
    'rejected',
    'cancelled'
  ));

alter table public."sponsor_review_logs"
  drop constraint if exists "sponsor_review_logs_action_check";

alter table public."sponsor_review_logs"
  add constraint "sponsor_review_logs_action_check"
  check ("review_action" in (
    'foundation_proof_created',
    'review_note',
    'brand_review_required',
    'creative_review_required',
    'disclosure_review_required',
    'safe_product_review_required',
    'safety_review_required',
    'scam_review_required',
    'payment_review_required',
    'manual_note',
    'unsafe_product_flagged_later',
    'scam_review_required_later',
    'payment_review_required_later'
  ));

alter table public."sponsor_payment_records"
  add column if not exists "test_mode_enabled" boolean default false not null,
  add column if not exists "checkout_provider" text,
  add column if not exists "checkout_session_reference" text,
  add column if not exists "payment_mode" text default 'not_active'::text not null;

alter table public."sponsor_payment_records"
  drop constraint if exists "sponsor_payment_records_status_check";

alter table public."sponsor_payment_records"
  add constraint "sponsor_payment_records_status_check"
  check ("status" in (
    'foundation',
    'draft',
    'checkout_not_connected',
    'test_mode_planned',
    'payment_not_connected',
    'held_later',
    'cancelled'
  ));

alter table public."sponsor_payment_records"
  drop constraint if exists "sponsor_payment_records_payment_mode_check";

alter table public."sponsor_payment_records"
  add constraint "sponsor_payment_records_payment_mode_check"
  check ("payment_mode" in ('not_active', 'test_mode_later', 'live_later'));

create table if not exists public."sponsor_review_queue_records" (
  "id" uuid primary key default gen_random_uuid(),
  "sponsor_deal_id" bigint references public."sponsor_deal_records"("id") on delete set null,
  "brand_id" uuid references public."sponsor_brand_records"("id") on delete set null,
  "creator_user_id" text,
  "channel_user_id" text,
  "review_status" text default 'foundation'::text not null,
  "review_type" text default 'general_review'::text not null,
  "priority" text default 'normal'::text not null,
  "assigned_to_user_id" text,
  "review_reason" text,
  "review_notes" text,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "sponsor_review_queue_records_status_check"
    check ("review_status" in (
      'foundation',
      'draft',
      'pending_review_later',
      'needs_disclosure_review_later',
      'needs_safety_review_later',
      'needs_payment_review_later',
      'approved_later',
      'rejected_later',
      'cancelled'
    )),
  constraint "sponsor_review_queue_records_type_check"
    check ("review_type" in (
      'general_review',
      'brand_review',
      'creative_review',
      'placement_review',
      'disclosure_review',
      'safe_product_review',
      'scam_review',
      'payment_readiness_review',
      'manual_foundation'
    )),
  constraint "sponsor_review_queue_records_priority_check"
    check ("priority" in ('low', 'normal', 'high', 'urgent_later'))
);

create table if not exists public."sponsor_safety_review_records" (
  "id" uuid primary key default gen_random_uuid(),
  "sponsor_deal_id" bigint references public."sponsor_deal_records"("id") on delete set null,
  "brand_id" uuid references public."sponsor_brand_records"("id") on delete set null,
  "review_type" text not null,
  "review_status" text default 'foundation'::text not null,
  "risk_category" text,
  "risk_notes" text,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "sponsor_safety_review_records_type_check"
    check ("review_type" in (
      'safe_product_review',
      'scam_review',
      'disclosure_review',
      'copyright_review',
      'illegal_product_review',
      'unsafe_product_review',
      'manual_foundation'
    )),
  constraint "sponsor_safety_review_records_status_check"
    check ("review_status" in (
      'foundation',
      'draft',
      'required_later',
      'under_review_later',
      'cleared_later',
      'rejected_later',
      'escalated_later'
    )),
  constraint "sponsor_safety_review_records_risk_category_check"
    check (
      "risk_category" is null
      or "risk_category" in (
        'undisclosed_sponsorship',
        'scam_promotion',
        'unsafe_product',
        'illegal_product',
        'copyright_or_stolen_content',
        'misleading_claim',
        'financial_risk',
        'health_or_safety_risk',
        'manual_foundation'
      )
    )
);

create index if not exists "sponsor_review_queue_records_deal_idx"
  on public."sponsor_review_queue_records" using btree ("sponsor_deal_id");

create index if not exists "sponsor_review_queue_records_status_idx"
  on public."sponsor_review_queue_records" using btree ("review_status", "created_at" desc);

create index if not exists "sponsor_review_queue_records_type_idx"
  on public."sponsor_review_queue_records" using btree ("review_type");

create index if not exists "sponsor_review_queue_records_channel_user_idx"
  on public."sponsor_review_queue_records" using btree ("channel_user_id");

create index if not exists "sponsor_review_queue_records_creator_user_idx"
  on public."sponsor_review_queue_records" using btree ("creator_user_id");

create index if not exists "sponsor_safety_review_records_deal_idx"
  on public."sponsor_safety_review_records" using btree ("sponsor_deal_id");

create index if not exists "sponsor_safety_review_records_status_idx"
  on public."sponsor_safety_review_records" using btree ("review_status", "created_at" desc);

create index if not exists "sponsor_safety_review_records_risk_category_idx"
  on public."sponsor_safety_review_records" using btree ("risk_category");

create index if not exists "sponsor_disclosure_records_required_before_live_idx"
  on public."sponsor_disclosure_records" using btree ("required_before_live");

create index if not exists "sponsor_payment_records_status_idx"
  on public."sponsor_payment_records" using btree ("status");

alter table public."sponsor_review_queue_records" enable row level security;
alter table public."sponsor_safety_review_records" enable row level security;

drop policy if exists "sponsor_review_queue_records_select_owner_operator" on public."sponsor_review_queue_records";
create policy "sponsor_review_queue_records_select_owner_operator"
  on public."sponsor_review_queue_records"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "sponsor_review_queue_records_insert_owner_operator" on public."sponsor_review_queue_records";
create policy "sponsor_review_queue_records_insert_owner_operator"
  on public."sponsor_review_queue_records"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "sponsor_review_queue_records_update_owner_operator" on public."sponsor_review_queue_records";
create policy "sponsor_review_queue_records_update_owner_operator"
  on public."sponsor_review_queue_records"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "sponsor_safety_review_records_select_owner_operator" on public."sponsor_safety_review_records";
create policy "sponsor_safety_review_records_select_owner_operator"
  on public."sponsor_safety_review_records"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "sponsor_safety_review_records_insert_owner_operator" on public."sponsor_safety_review_records";
create policy "sponsor_safety_review_records_insert_owner_operator"
  on public."sponsor_safety_review_records"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "sponsor_safety_review_records_update_owner_operator" on public."sponsor_safety_review_records";
create policy "sponsor_safety_review_records_update_owner_operator"
  on public."sponsor_safety_review_records"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

revoke all on table public."sponsor_review_queue_records" from "anon";
revoke all on table public."sponsor_safety_review_records" from "anon";
grant select, insert, update on table public."sponsor_review_queue_records" to "authenticated";
grant select, insert, update on table public."sponsor_safety_review_records" to "authenticated";

do $$
declare
  review_metadata jsonb := jsonb_build_object(
    'sponsor_review_queue_foundation_proof', true,
    'created_by', 'codex_sponsor_review_queue_foundation',
    'foundation_only', true,
    'live_money_action', false,
    'approval_execution', false,
    'checkout_created', false,
    'brand_charged', false
  );
  disclosure_metadata jsonb := jsonb_build_object(
    'sponsor_disclosure_moderation_foundation_proof', true,
    'created_by', 'codex_sponsor_disclosure_moderation_foundation',
    'foundation_only', true,
    'live_enforcement_action', false,
    'brand_charged', false,
    'checkout_created', false
  );
  payment_metadata jsonb := jsonb_build_object(
    'sponsor_payment_test_mode_foundation_proof', true,
    'created_by', 'codex_sponsor_payment_test_mode_foundation',
    'foundation_only', true,
    'live_money_action', false,
    'checkout_created', false,
    'brand_charged', false,
    'creator_payout_released', false
  );
  sponsor_foundation_brand_id uuid;
  sponsor_foundation_deal_id bigint;
  sponsor_foundation_payment_id uuid := 'd0a90b80-7975-41cf-8271-13a5d043d78e';
begin
  select "id"
    into sponsor_foundation_brand_id
    from public."sponsor_brand_records"
    where "metadata" @> '{"sponsor_review_queue_foundation_proof": true}'::jsonb
    limit 1;

  if sponsor_foundation_brand_id is null then
    insert into public."sponsor_brand_records" (
      "display_name",
      "status",
      "metadata"
    ) values (
      'Sponsor Monetization Foundation Brand',
      'foundation',
      review_metadata || jsonb_build_object(
        'sponsor_monetization_foundation_brand', true,
        'sponsor_disclosure_moderation_foundation_ready', true,
        'sponsor_payment_test_mode_foundation_ready', true
      )
    )
    returning "id" into sponsor_foundation_brand_id;
  else
    update public."sponsor_brand_records"
      set
        "display_name" = 'Sponsor Monetization Foundation Brand',
        "status" = 'foundation',
        "metadata" = "metadata" || review_metadata || jsonb_build_object(
          'sponsor_monetization_foundation_brand', true,
          'sponsor_disclosure_moderation_foundation_ready', true,
          'sponsor_payment_test_mode_foundation_ready', true
        ),
        "updated_at" = timezone('utc'::text, now())
      where "id" = sponsor_foundation_brand_id;
  end if;

  select "id"
    into sponsor_foundation_deal_id
    from public."sponsor_deal_records"
    where "metadata" @> '{"sponsor_review_queue_foundation_proof": true}'::jsonb
    limit 1;

  if sponsor_foundation_deal_id is null then
    insert into public."sponsor_deal_records" (
      "brand_id",
      "brand_name",
      "creator_user_id",
      "channel_user_id",
      "deal_title",
      "deal_type",
      "status",
      "gross_amount_minor",
      "gross_amount_cents",
      "currency",
      "platform_share_bps",
      "creator_share_bps",
      "disclosure_required",
      "metadata"
    ) values (
      sponsor_foundation_brand_id,
      'Sponsor Monetization Foundation Brand',
      null,
      null,
      'Sponsor Monetization Foundation Proof Deal',
      'manual_foundation',
      'under_review_later',
      0,
      0,
      'usd',
      2000,
      8000,
      true,
      review_metadata || jsonb_build_object(
        'sponsor_disclosure_moderation_foundation_ready', true,
        'sponsor_payment_test_mode_foundation_ready', true,
        'approval_execution', false,
        'placement_activation_connected', false,
        'checkout_connected', false,
        'payment_link_connected', false,
        'payout_split_execution_connected', false
      )
    )
    returning "id" into sponsor_foundation_deal_id;
  else
    update public."sponsor_deal_records"
      set
        "brand_id" = sponsor_foundation_brand_id,
        "brand_name" = 'Sponsor Monetization Foundation Brand',
        "deal_title" = 'Sponsor Monetization Foundation Proof Deal',
        "deal_type" = 'manual_foundation',
        "status" = 'under_review_later',
        "gross_amount_minor" = 0,
        "gross_amount_cents" = 0,
        "currency" = 'usd',
        "platform_share_bps" = 2000,
        "creator_share_bps" = 8000,
        "disclosure_required" = true,
        "metadata" = "metadata" || review_metadata || jsonb_build_object(
          'sponsor_disclosure_moderation_foundation_ready', true,
          'sponsor_payment_test_mode_foundation_ready', true,
          'approval_execution', false,
          'placement_activation_connected', false,
          'checkout_connected', false,
          'payment_link_connected', false,
          'payout_split_execution_connected', false
        ),
        "updated_at" = timezone('utc'::text, now())
      where "id" = sponsor_foundation_deal_id;
  end if;

  insert into public."sponsor_review_queue_records" (
    "id",
    "sponsor_deal_id",
    "brand_id",
    "review_status",
    "review_type",
    "priority",
    "review_reason",
    "review_notes",
    "metadata"
  ) values
    (
      '377a0d4c-e5ff-4dc7-9254-51ae7579fba1',
      sponsor_foundation_deal_id,
      sponsor_foundation_brand_id,
      'foundation',
      'general_review',
      'normal',
      'Sponsor deal review queue foundation only.',
      'No sponsor approval, activation, checkout, brand charge, or creator payout split execution is available.',
      review_metadata || jsonb_build_object('queue_kind', 'general_review')
    ),
    (
      '46aeab9f-89cd-4acb-8378-14374e7d7df8',
      sponsor_foundation_deal_id,
      sponsor_foundation_brand_id,
      'needs_disclosure_review_later',
      'disclosure_review',
      'normal',
      'Disclosure review is required before sponsor deals can go live later.',
      'Foundation-only review queue row; no executable approval action exists.',
      review_metadata || jsonb_build_object('queue_kind', 'disclosure_review')
    ),
    (
      '9734ef08-72f7-49f9-9775-85e6ab5e3ee4',
      sponsor_foundation_deal_id,
      sponsor_foundation_brand_id,
      'needs_safety_review_later',
      'safe_product_review',
      'normal',
      'Safe product and scam review are required before sponsor deals can go live later.',
      'Foundation-only review queue row; no enforcement or activation action exists.',
      review_metadata || jsonb_build_object('queue_kind', 'safe_product_review')
    ),
    (
      '4c464a33-7bc2-4b30-9a8c-1c5961dcc689',
      sponsor_foundation_deal_id,
      sponsor_foundation_brand_id,
      'needs_payment_review_later',
      'payment_readiness_review',
      'normal',
      'Payment readiness review is future-only and cannot create checkout or charge a brand.',
      'Foundation-only review queue row; no payment or payout action exists.',
      review_metadata || jsonb_build_object('queue_kind', 'payment_readiness_review')
    )
  on conflict ("id") do update set
    "sponsor_deal_id" = excluded."sponsor_deal_id",
    "brand_id" = excluded."brand_id",
    "review_status" = excluded."review_status",
    "review_type" = excluded."review_type",
    "priority" = excluded."priority",
    "review_reason" = excluded."review_reason",
    "review_notes" = excluded."review_notes",
    "metadata" = excluded."metadata",
    "updated_at" = timezone('utc'::text, now());

  insert into public."sponsor_review_logs" (
    "id",
    "sponsor_deal_id",
    "review_action",
    "reason",
    "metadata"
  ) values (
    'd36b9ce5-2e7c-4ca1-86f5-ef2802151e15',
    sponsor_foundation_deal_id,
    'review_note',
    'Sponsor review queue foundation proof only; no approval, activation, checkout, or money action executed.',
    review_metadata || jsonb_build_object('review_queue_connected', true)
  )
  on conflict ("id") do update set
    "sponsor_deal_id" = excluded."sponsor_deal_id",
    "review_action" = excluded."review_action",
    "reason" = excluded."reason",
    "metadata" = excluded."metadata";

  insert into public."sponsor_disclosure_records" (
    "id",
    "sponsor_deal_id",
    "disclosure_text",
    "status",
    "required_before_live",
    "metadata"
  ) values (
    'f440a69c-c6f0-47ce-9d1e-231dfb637517',
    sponsor_foundation_deal_id,
    'Paid partnership disclosure required before this sponsor deal can go live.',
    'required_later',
    true,
    disclosure_metadata || jsonb_build_object('disclosure_required_before_live', true)
  )
  on conflict ("id") do update set
    "sponsor_deal_id" = excluded."sponsor_deal_id",
    "disclosure_text" = excluded."disclosure_text",
    "status" = excluded."status",
    "required_before_live" = excluded."required_before_live",
    "metadata" = excluded."metadata",
    "updated_at" = timezone('utc'::text, now());

  insert into public."sponsor_safety_review_records" (
    "id",
    "sponsor_deal_id",
    "brand_id",
    "review_type",
    "review_status",
    "risk_category",
    "risk_notes",
    "metadata"
  ) values (
    '25b70781-b543-49d6-8148-439d998d97f5',
    sponsor_foundation_deal_id,
    sponsor_foundation_brand_id,
    'safe_product_review',
    'required_later',
    'unsafe_product',
    'Safe product and scam review are required later before sponsor deals can go live.',
    disclosure_metadata || jsonb_build_object(
      'safe_product_review_required_later', true,
      'scam_review_required_later', true,
      'content_enforcement_executed', false
    )
  )
  on conflict ("id") do update set
    "sponsor_deal_id" = excluded."sponsor_deal_id",
    "brand_id" = excluded."brand_id",
    "review_type" = excluded."review_type",
    "review_status" = excluded."review_status",
    "risk_category" = excluded."risk_category",
    "risk_notes" = excluded."risk_notes",
    "metadata" = excluded."metadata",
    "updated_at" = timezone('utc'::text, now());

  insert into public."sponsor_review_logs" (
    "id",
    "sponsor_deal_id",
    "review_action",
    "reason",
    "metadata"
  ) values (
    'f8c780c8-0cd2-492a-81c2-13eb7d8dfc62',
    sponsor_foundation_deal_id,
    'disclosure_review_required',
    'Sponsor disclosure and moderation foundation proof only; no content restriction or enforcement action executed.',
    disclosure_metadata || jsonb_build_object(
      'disclosure_required_before_live', true,
      'safe_product_review_required_later', true
    )
  )
  on conflict ("id") do update set
    "sponsor_deal_id" = excluded."sponsor_deal_id",
    "review_action" = excluded."review_action",
    "reason" = excluded."reason",
    "metadata" = excluded."metadata";

  insert into public."sponsor_payment_records" (
    "id",
    "sponsor_deal_id",
    "provider",
    "provider_reference",
    "status",
    "currency",
    "gross_amount_cents",
    "net_amount_cents",
    "platform_fee_cents",
    "creator_share_cents",
    "test_mode_enabled",
    "checkout_provider",
    "checkout_session_reference",
    "payment_mode",
    "metadata"
  ) values (
    sponsor_foundation_payment_id,
    sponsor_foundation_deal_id,
    null,
    null,
    'test_mode_planned',
    'USD',
    0,
    0,
    0,
    0,
    false,
    null,
    null,
    'test_mode_later',
    payment_metadata || jsonb_build_object(
      'test_mode_payment_foundation', true,
      'checkout_provider_connected', false,
      'checkout_session_created', false,
      'payment_link_created', false,
      'paid_status', false
    )
  )
  on conflict ("id") do update set
    "sponsor_deal_id" = excluded."sponsor_deal_id",
    "provider" = excluded."provider",
    "provider_reference" = excluded."provider_reference",
    "status" = excluded."status",
    "currency" = excluded."currency",
    "gross_amount_cents" = excluded."gross_amount_cents",
    "net_amount_cents" = excluded."net_amount_cents",
    "platform_fee_cents" = excluded."platform_fee_cents",
    "creator_share_cents" = excluded."creator_share_cents",
    "test_mode_enabled" = excluded."test_mode_enabled",
    "checkout_provider" = excluded."checkout_provider",
    "checkout_session_reference" = excluded."checkout_session_reference",
    "payment_mode" = excluded."payment_mode",
    "metadata" = excluded."metadata",
    "updated_at" = timezone('utc'::text, now());

  insert into public."sponsor_payout_split_records" (
    "id",
    "sponsor_deal_id",
    "payment_record_id",
    "creator_user_id",
    "platform_share_bps",
    "creator_share_bps",
    "gross_amount_cents",
    "platform_share_cents",
    "creator_share_cents",
    "status",
    "metadata"
  ) values (
    '86429755-adba-4638-98cc-60e49ac2239a',
    sponsor_foundation_deal_id,
    sponsor_foundation_payment_id,
    null,
    2000,
    8000,
    0,
    0,
    0,
    'calculation_not_active',
    payment_metadata || jsonb_build_object(
      'split_calculation_foundation', true,
      'creator_payable_balance_created', false,
      'payout_execution_connected', false
    )
  )
  on conflict ("id") do update set
    "sponsor_deal_id" = excluded."sponsor_deal_id",
    "payment_record_id" = excluded."payment_record_id",
    "creator_user_id" = excluded."creator_user_id",
    "platform_share_bps" = excluded."platform_share_bps",
    "creator_share_bps" = excluded."creator_share_bps",
    "gross_amount_cents" = excluded."gross_amount_cents",
    "platform_share_cents" = excluded."platform_share_cents",
    "creator_share_cents" = excluded."creator_share_cents",
    "status" = excluded."status",
    "metadata" = excluded."metadata",
    "updated_at" = timezone('utc'::text, now());

  insert into public."sponsor_review_logs" (
    "id",
    "sponsor_deal_id",
    "review_action",
    "reason",
    "metadata"
  ) values (
    '468f727c-c0fe-47f7-8597-96ac264b5b6b',
    sponsor_foundation_deal_id,
    'payment_review_required',
    'Sponsor payment test-mode foundation proof only; no checkout, brand charge, or creator payout split execution occurred.',
    payment_metadata || jsonb_build_object(
      'payment_readiness_review_required_later', true,
      'checkout_provider_connected', false
    )
  )
  on conflict ("id") do update set
    "sponsor_deal_id" = excluded."sponsor_deal_id",
    "review_action" = excluded."review_action",
    "reason" = excluded."reason",
    "metadata" = excluded."metadata";

  insert into public."platform_admin_audit_logs" (
    "actor_role",
    "action",
    "action_category",
    "target_type",
    "target_id",
    "reason",
    "metadata"
  )
  select
    'foundation',
    'sponsor_review_queue_foundation_recorded',
    'sponsor',
    'sponsor_review_queue_records',
    '377a0d4c-e5ff-4dc7-9254-51ae7579fba1',
    'Sponsor deal review queue foundation recorded only. No sponsor approval, activation, checkout, brand charge, or creator payout executed.',
    review_metadata || jsonb_build_object(
      'dangerous_action_executed', false,
      'sponsor_approval_executed', false
    )
  where not exists (
    select 1
      from public."platform_admin_audit_logs"
      where "action" = 'sponsor_review_queue_foundation_recorded'
        and "metadata"->>'created_by' = 'codex_sponsor_review_queue_foundation'
  );

  insert into public."platform_admin_audit_logs" (
    "actor_role",
    "action",
    "action_category",
    "target_type",
    "target_id",
    "reason",
    "metadata"
  )
  select
    'foundation',
    'sponsor_disclosure_moderation_foundation_recorded',
    'sponsor',
    'sponsor_safety_review_records',
    '25b70781-b543-49d6-8148-439d998d97f5',
    'Sponsor disclosure/moderation foundation recorded only. No enforcement, content removal, creator restriction, checkout, or brand charge executed.',
    disclosure_metadata || jsonb_build_object(
      'dangerous_action_executed', false,
      'content_enforcement_executed', false
    )
  where not exists (
    select 1
      from public."platform_admin_audit_logs"
      where "action" = 'sponsor_disclosure_moderation_foundation_recorded'
        and "metadata"->>'created_by' = 'codex_sponsor_disclosure_moderation_foundation'
  );

  insert into public."platform_admin_audit_logs" (
    "actor_role",
    "action",
    "action_category",
    "target_type",
    "target_id",
    "reason",
    "metadata"
  )
  select
    'foundation',
    'sponsor_payment_test_mode_foundation_recorded',
    'sponsor',
    'sponsor_payment_records',
    sponsor_foundation_payment_id::text,
    'Sponsor payment test-mode foundation recorded only. No checkout, payment link, brand charge, paid status, or creator payout split execution occurred.',
    payment_metadata || jsonb_build_object(
      'dangerous_action_executed', false,
      'payment_link_created', false,
      'paid_status_created', false
    )
  where not exists (
    select 1
      from public."platform_admin_audit_logs"
      where "action" = 'sponsor_payment_test_mode_foundation_recorded'
        and "metadata"->>'created_by' = 'codex_sponsor_payment_test_mode_foundation'
  );
end $$;
