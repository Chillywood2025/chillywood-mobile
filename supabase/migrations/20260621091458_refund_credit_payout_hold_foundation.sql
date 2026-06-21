-- Refund / credit / creator payout-hold foundation.
-- Additive policy/readiness layer only. This migration does not call payment
-- providers, execute refunds, create spendable credits, release payout holds,
-- create payable balances, or enable live money/payouts.

create table if not exists public."money_refund_policy_rules" (
  "id" uuid primary key default gen_random_uuid(),
  "policy_key" text unique not null,
  "display_name" text not null,
  "standard_refund_policy" text not null,
  "default_remedy" text not null default 'none',
  "eligible_consumption_states" text[] not null default '{}'::text[],
  "ineligible_consumption_states" text[] not null default '{}'::text[],
  "creator_obligation_required" boolean not null default false,
  "payout_hold_required" boolean not null default false,
  "provider_action_required" boolean not null default false,
  "cash_refund_allowed_later" boolean not null default false,
  "credit_allowed_later" boolean not null default false,
  "foundation_only" boolean not null default true,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "money_refund_policy_rules_policy_key_check"
    check ("policy_key" in (
      'premium_subscription',
      'creator_tip',
      'paid_creator_video',
      'watch_party_ticket',
      'live_watch_party_access_pass',
      'live_watch_party_seat_pass',
      'channel_subscription',
      'vip_pass',
      'event_pass',
      'merch_physical_good',
      'payout_readiness'
    )),
  constraint "money_refund_policy_rules_default_remedy_check"
    check ("default_remedy" in (
      'none',
      'cash_refund_review',
      'in_app_credit_review',
      'provider_refund_required',
      'admin_review_required'
    )),
  constraint "money_refund_policy_rules_metadata_safe_check"
    check ("metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload|access_token|refresh_token)')
);

create table if not exists public."money_refund_review_records" (
  "id" uuid primary key default gen_random_uuid(),
  "policy_key" text not null,
  "requester_user_id" uuid,
  "buyer_user_id" uuid,
  "creator_user_id" uuid,
  "source_type" text,
  "source_id" uuid,
  "provider" text,
  "provider_event_id" uuid references public."provider_events"("id") on delete set null,
  "purchase_intent_id" uuid references public."money_purchase_intents"("id") on delete set null,
  "access_grant_id" uuid references public."access_grants"("id") on delete set null,
  "environment" text not null default 'setup',
  "review_status" text not null default 'dry_run_only',
  "consumption_state" text not null default 'not_started',
  "creator_obligation_state" text not null default 'not_applicable',
  "refund_remedy" text not null default 'admin_review_required',
  "provider_refund_status" text not null default 'not_requested',
  "provider_refund_evidence_id" text,
  "credit_review_record_id" uuid,
  "payout_hold_record_id" uuid,
  "amount_cents" integer not null default 0,
  "currency" text not null default 'USD',
  "safe_reason_code" text not null default 'foundation_dry_run',
  "safe_user_summary" text not null default 'Refund or credit review is setup-only. No money moved.',
  "safe_creator_summary" text not null default 'Creator payout remains unavailable while live money and payouts are off.',
  "safe_admin_summary" text not null default 'Foundation-only review record. Provider evidence is required before any future refund completion.',
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "money_refund_review_records_policy_key_check"
    check ("policy_key" in (
      'premium_subscription',
      'creator_tip',
      'paid_creator_video',
      'watch_party_ticket',
      'live_watch_party_access_pass',
      'live_watch_party_seat_pass',
      'channel_subscription',
      'vip_pass',
      'event_pass',
      'merch_physical_good',
      'payout_readiness'
    )),
  constraint "money_refund_review_records_environment_check"
    check ("environment" in ('setup', 'sandbox', 'production')),
  constraint "money_refund_review_records_status_check"
    check ("review_status" in (
      'dry_run_only',
      'review_required',
      'admin_review_required',
      'provider_review_required',
      'credit_review_required',
      'denied_later',
      'approved_later',
      'canceled'
    )),
  constraint "money_refund_review_records_consumption_state_check"
    check ("consumption_state" in (
      'not_started',
      'access_granted',
      'entered_room',
      'attended_event',
      'playback_started',
      'seat_review_pending',
      'seat_approved',
      'fulfilled',
      'shipped',
      'consumed'
    )),
  constraint "money_refund_review_records_obligation_state_check"
    check ("creator_obligation_state" in (
      'not_applicable',
      'pending',
      'met',
      'failed',
      'review_required',
      'waived_by_policy'
    )),
  constraint "money_refund_review_records_remedy_check"
    check ("refund_remedy" in (
      'none',
      'cash_refund_review',
      'in_app_credit_review',
      'provider_refund_required',
      'admin_review_required'
    )),
  constraint "money_refund_review_records_provider_status_check"
    check ("provider_refund_status" in (
      'not_requested',
      'required_later',
      'requested_later',
      'completed_with_evidence_later',
      'denied_later'
    )),
  constraint "money_refund_review_records_provider_evidence_check"
    check (
      "provider_refund_status" <> 'completed_with_evidence_later'
      or nullif(trim(coalesce("provider_refund_evidence_id", '')), '') is not null
    ),
  constraint "money_refund_review_records_amount_check" check ("amount_cents" >= 0),
  constraint "money_refund_review_records_currency_check" check ("currency" ~ '^[A-Z]{3}$'),
  constraint "money_refund_review_records_no_provider_completion_without_evidence"
    check (
      "provider_refund_status" <> 'completed_with_evidence_later'
      or (
        "environment" = 'production'
        and "provider_event_id" is not null
        and nullif(trim(coalesce("provider_refund_evidence_id", '')), '') is not null
      )
    ),
  constraint "money_refund_review_records_metadata_safe_check"
    check ("metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload|access_token|refresh_token|card|bank)')
);

create table if not exists public."money_credit_ledger_entries" (
  "id" uuid primary key default gen_random_uuid(),
  "user_id" uuid not null,
  "refund_review_id" uuid references public."money_refund_review_records"("id") on delete set null,
  "policy_key" text not null,
  "environment" text not null default 'setup',
  "credit_status" text not null default 'dry_run_only',
  "credit_type" text not null default 'non_cash_app_credit_review',
  "amount_cents" integer not null default 0,
  "currency" text not null default 'USD',
  "spendable" boolean not null default false,
  "cash_equivalent" boolean not null default false,
  "transferable" boolean not null default false,
  "withdrawable" boolean not null default false,
  "payable" boolean not null default false,
  "live_money_enabled_at_approval" boolean not null default false,
  "provider_refund_evidence_id" text,
  "safe_user_summary" text not null default 'Credit review is setup-only. Credits are not cash, not transferable, not withdrawable, and not spendable.',
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "money_credit_ledger_entries_policy_key_check"
    check ("policy_key" in (
      'premium_subscription',
      'creator_tip',
      'paid_creator_video',
      'watch_party_ticket',
      'live_watch_party_access_pass',
      'live_watch_party_seat_pass',
      'channel_subscription',
      'vip_pass',
      'event_pass',
      'merch_physical_good',
      'payout_readiness'
    )),
  constraint "money_credit_ledger_entries_environment_check"
    check ("environment" in ('setup', 'sandbox', 'production')),
  constraint "money_credit_ledger_entries_status_check"
    check ("credit_status" in (
      'setup_only',
      'dry_run_only',
      'review_required',
      'approved_later',
      'voided',
      'expired'
    )),
  constraint "money_credit_ledger_entries_type_check"
    check ("credit_type" in (
      'non_cash_app_credit_review',
      'service_credit_later',
      'provider_store_credit_later',
      'merch_return_credit_later'
    )),
  constraint "money_credit_ledger_entries_amount_check" check ("amount_cents" >= 0),
  constraint "money_credit_ledger_entries_currency_check" check ("currency" ~ '^[A-Z]{3}$'),
  constraint "money_credit_ledger_entries_not_cash_check"
    check ("cash_equivalent" = false and "transferable" = false and "withdrawable" = false and "payable" = false),
  constraint "money_credit_ledger_entries_spendable_future_switch_check"
    check (
      "spendable" = false
      or (
        "environment" = 'production'
        and "credit_status" = 'approved_later'
        and "live_money_enabled_at_approval" = true
        and nullif(trim(coalesce("provider_refund_evidence_id", '')), '') is not null
      )
    ),
  constraint "money_credit_ledger_entries_setup_sandbox_not_spendable_check"
    check ("environment" = 'production' or "spendable" = false),
  constraint "money_credit_ledger_entries_metadata_safe_check"
    check ("metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload|access_token|refresh_token|card|bank)')
);

create table if not exists public."creator_obligation_review_records" (
  "id" uuid primary key default gen_random_uuid(),
  "creator_user_id" uuid not null,
  "buyer_user_id" uuid,
  "refund_review_id" uuid references public."money_refund_review_records"("id") on delete set null,
  "policy_key" text not null,
  "source_type" text,
  "source_id" uuid,
  "environment" text not null default 'setup',
  "obligation_state" text not null default 'pending',
  "review_reason" text not null default 'foundation_only',
  "safe_creator_summary" text not null default 'Creator obligation review is foundation-only. No payout release is available.',
  "safe_admin_summary" text not null default 'Review obligation before future payout eligibility.',
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "creator_obligation_review_records_policy_key_check"
    check ("policy_key" in (
      'creator_tip',
      'paid_creator_video',
      'watch_party_ticket',
      'live_watch_party_access_pass',
      'live_watch_party_seat_pass',
      'channel_subscription',
      'vip_pass',
      'event_pass',
      'merch_physical_good'
    )),
  constraint "creator_obligation_review_records_environment_check"
    check ("environment" in ('setup', 'sandbox', 'production')),
  constraint "creator_obligation_review_records_state_check"
    check ("obligation_state" in (
      'not_applicable',
      'pending',
      'met',
      'failed',
      'review_required',
      'waived_by_policy'
    )),
  constraint "creator_obligation_review_records_metadata_safe_check"
    check ("metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload|access_token|refresh_token|card|bank)')
);

create table if not exists public."creator_payout_hold_records" (
  "id" uuid primary key default gen_random_uuid(),
  "creator_user_id" uuid not null,
  "refund_review_id" uuid references public."money_refund_review_records"("id") on delete set null,
  "obligation_review_id" uuid references public."creator_obligation_review_records"("id") on delete set null,
  "existing_creator_payout_hold_id" uuid,
  "policy_key" text not null,
  "environment" text not null default 'setup',
  "hold_state" text not null default 'hold_required',
  "hold_reason" text not null default 'refund_risk_window',
  "held_until" timestamptz,
  "payouts_enabled_at_release" boolean not null default false,
  "live_money_enabled_at_release" boolean not null default false,
  "provider_release_evidence_id" text,
  "safe_creator_summary" text not null default 'Payout is held or unavailable until obligations and refund windows clear. Payouts are not active.',
  "safe_admin_summary" text not null default 'Foundation payout-hold record. It cannot release payable money while payouts are off.',
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "creator_payout_hold_records_policy_key_check"
    check ("policy_key" in (
      'creator_tip',
      'paid_creator_video',
      'watch_party_ticket',
      'live_watch_party_access_pass',
      'live_watch_party_seat_pass',
      'channel_subscription',
      'vip_pass',
      'event_pass',
      'merch_physical_good'
    )),
  constraint "creator_payout_hold_records_environment_check"
    check ("environment" in ('setup', 'sandbox', 'production')),
  constraint "creator_payout_hold_records_state_check"
    check ("hold_state" in (
      'not_applicable',
      'hold_required',
      'held',
      'eligible_later',
      'blocked',
      'released_later'
    )),
  constraint "creator_payout_hold_records_reason_check"
    check ("hold_reason" in (
      'not_applicable',
      'refund_risk_window',
      'chargeback_risk_window',
      'creator_obligation_pending',
      'obligation_failed',
      'fraud_review',
      'provider_review',
      'payouts_disabled',
      'live_money_disabled'
    )),
  constraint "creator_payout_hold_records_release_blocked_while_off_check"
    check (
      "hold_state" <> 'released_later'
      or (
        "environment" = 'production'
        and "payouts_enabled_at_release" = true
        and "live_money_enabled_at_release" = true
        and nullif(trim(coalesce("provider_release_evidence_id", '')), '') is not null
      )
    ),
  constraint "creator_payout_hold_records_setup_sandbox_not_released_check"
    check ("environment" = 'production' or "hold_state" <> 'released_later'),
  constraint "creator_payout_hold_records_metadata_safe_check"
    check ("metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload|access_token|refresh_token|card|bank)')
);

create index if not exists "money_refund_policy_rules_key_idx"
  on public."money_refund_policy_rules" ("policy_key");
create index if not exists "money_refund_review_records_requester_idx"
  on public."money_refund_review_records" ("requester_user_id", "created_at" desc);
create index if not exists "money_refund_review_records_buyer_idx"
  on public."money_refund_review_records" ("buyer_user_id", "created_at" desc);
create index if not exists "money_refund_review_records_creator_idx"
  on public."money_refund_review_records" ("creator_user_id", "created_at" desc);
create index if not exists "money_refund_review_records_policy_status_idx"
  on public."money_refund_review_records" ("policy_key", "review_status", "created_at" desc);
create index if not exists "money_credit_ledger_entries_user_idx"
  on public."money_credit_ledger_entries" ("user_id", "created_at" desc);
create index if not exists "money_credit_ledger_entries_policy_status_idx"
  on public."money_credit_ledger_entries" ("policy_key", "credit_status", "created_at" desc);
create index if not exists "creator_obligation_review_records_creator_idx"
  on public."creator_obligation_review_records" ("creator_user_id", "created_at" desc);
create index if not exists "creator_payout_hold_records_creator_idx"
  on public."creator_payout_hold_records" ("creator_user_id", "created_at" desc);
create index if not exists "creator_payout_hold_records_state_idx"
  on public."creator_payout_hold_records" ("hold_state", "created_at" desc);

alter table public."money_refund_policy_rules" enable row level security;
alter table public."money_refund_review_records" enable row level security;
alter table public."money_credit_ledger_entries" enable row level security;
alter table public."creator_obligation_review_records" enable row level security;
alter table public."creator_payout_hold_records" enable row level security;

drop policy if exists "money_refund_policy_rules_select_authenticated" on public."money_refund_policy_rules";
create policy "money_refund_policy_rules_select_authenticated"
  on public."money_refund_policy_rules"
  for select
  to "authenticated"
  using (true);

drop policy if exists "money_refund_policy_rules_write_owner_operator" on public."money_refund_policy_rules";
create policy "money_refund_policy_rules_write_owner_operator"
  on public."money_refund_policy_rules"
  for all
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "money_refund_review_records_select_scoped" on public."money_refund_review_records";
create policy "money_refund_review_records_select_scoped"
  on public."money_refund_review_records"
  for select
  to "authenticated"
  using (
    public.has_platform_role(array['owner'::text, 'operator'::text])
    or "requester_user_id" = auth.uid()
    or "buyer_user_id" = auth.uid()
    or "creator_user_id" = auth.uid()
  );

drop policy if exists "money_refund_review_records_insert_dry_run_scoped" on public."money_refund_review_records";
create policy "money_refund_review_records_insert_dry_run_scoped"
  on public."money_refund_review_records"
  for insert
  to "authenticated"
  with check (
    (
      public.has_platform_role(array['owner'::text, 'operator'::text])
    )
    or (
      "requester_user_id" = auth.uid()
      and "review_status" = 'dry_run_only'
      and "provider_refund_status" = 'not_requested'
      and "environment" in ('setup', 'sandbox')
      and coalesce("amount_cents", 0) >= 0
    )
  );

drop policy if exists "money_refund_review_records_update_owner_operator" on public."money_refund_review_records";
create policy "money_refund_review_records_update_owner_operator"
  on public."money_refund_review_records"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "money_credit_ledger_entries_select_scoped" on public."money_credit_ledger_entries";
create policy "money_credit_ledger_entries_select_scoped"
  on public."money_credit_ledger_entries"
  for select
  to "authenticated"
  using (
    public.has_platform_role(array['owner'::text, 'operator'::text])
    or "user_id" = auth.uid()
  );

drop policy if exists "money_credit_ledger_entries_write_owner_operator" on public."money_credit_ledger_entries";
create policy "money_credit_ledger_entries_write_owner_operator"
  on public."money_credit_ledger_entries"
  for all
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_obligation_review_records_select_scoped" on public."creator_obligation_review_records";
create policy "creator_obligation_review_records_select_scoped"
  on public."creator_obligation_review_records"
  for select
  to "authenticated"
  using (
    public.has_platform_role(array['owner'::text, 'operator'::text])
    or "creator_user_id" = auth.uid()
    or "buyer_user_id" = auth.uid()
  );

drop policy if exists "creator_obligation_review_records_write_owner_operator" on public."creator_obligation_review_records";
create policy "creator_obligation_review_records_write_owner_operator"
  on public."creator_obligation_review_records"
  for all
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "creator_payout_hold_records_select_scoped" on public."creator_payout_hold_records";
create policy "creator_payout_hold_records_select_scoped"
  on public."creator_payout_hold_records"
  for select
  to "authenticated"
  using (
    public.has_platform_role(array['owner'::text, 'operator'::text])
    or "creator_user_id" = auth.uid()
  );

drop policy if exists "creator_payout_hold_records_write_owner_operator" on public."creator_payout_hold_records";
create policy "creator_payout_hold_records_write_owner_operator"
  on public."creator_payout_hold_records"
  for all
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

revoke all on table public."money_refund_policy_rules" from "anon";
revoke all on table public."money_refund_review_records" from "anon";
revoke all on table public."money_credit_ledger_entries" from "anon";
revoke all on table public."creator_obligation_review_records" from "anon";
revoke all on table public."creator_payout_hold_records" from "anon";

grant select, insert, update on table public."money_refund_policy_rules" to "authenticated";
grant select, insert, update on table public."money_refund_review_records" to "authenticated";
grant select, insert, update on table public."money_credit_ledger_entries" to "authenticated";
grant select, insert, update on table public."creator_obligation_review_records" to "authenticated";
grant select, insert, update on table public."creator_payout_hold_records" to "authenticated";

insert into public."money_refund_policy_rules" (
  "policy_key",
  "display_name",
  "standard_refund_policy",
  "default_remedy",
  "eligible_consumption_states",
  "ineligible_consumption_states",
  "creator_obligation_required",
  "payout_hold_required",
  "provider_action_required",
  "cash_refund_allowed_later",
  "credit_allowed_later",
  "metadata"
)
values
  ('premium_subscription', 'Chi''llywood Premium', 'Generally non-refundable after purchase/renewal except law, store/provider/admin decision, fraud, duplicate charge, unauthorized purchase, or platform technical failure.', 'admin_review_required', array['not_started'], array['consumed'], false, false, true, true, false, '{"platform_revenue": true, "creator_income": false, "no_creator_payout_hold_needed": true}'::jsonb),
  ('creator_tip', 'Creator Tip', 'No standard refunds; exceptions include fraud, duplicate charge, unauthorized purchase, provider/legal/admin decision, or platform/creator abuse. Tips unlock nothing.', 'admin_review_required', array['not_started'], array['consumed'], true, true, true, true, false, '{"tips_unlock_nothing": true, "payout_hold_until_risk_window_clears": true}'::jsonb),
  ('paid_creator_video', 'Paid Creator Video', 'Refund or credit review when access never worked, content is removed before meaningful use, or admin finds misrepresentation. Not normally refundable after playback/access is consumed.', 'cash_refund_review', array['not_started','access_granted'], array['playback_started','consumed'], true, true, true, true, true, '{"access_scope": "one_video", "payout_hold_until_delivery_and_refund_risk_clear": true}'::jsonb),
  ('watch_party_ticket', 'Watch-Party Ticket', 'Refund review when buyer has not entered/used the room and the room is canceled/unavailable or platform fault blocks access. No standard refund after room entry/use unless platform fault or legal/provider/admin decision.', 'cash_refund_review', array['not_started','access_granted'], array['entered_room','consumed'], true, true, true, true, true, '{"access_scope": "one_room_target", "grants_livekit_publish": false, "grants_host_power": false}'::jsonb),
  ('live_watch_party_access_pass', 'Live Watch-Party Access Pass', 'Refund review when access never worked or target canceled before entry. No standard refund after viewer/listener entry unless platform fault.', 'cash_refund_review', array['not_started','access_granted'], array['entered_room','consumed'], true, true, true, true, true, '{"viewer_listener_access_only": true, "grants_speaker_power": false}'::jsonb),
  ('live_watch_party_seat_pass', 'Live Watch-Party Seat Pass', 'Refund or credit review if seat opportunity is never provided or host never reviews/approves within the policy window. No standard refund after valid approval/use or removal for valid moderation/safety reasons.', 'in_app_credit_review', array['seat_review_pending'], array['seat_approved','consumed'], true, true, true, true, true, '{"seat_eligibility_only": true, "host_approval_still_wins": true, "livekit_authority_rules_still_win": true}'::jsonb),
  ('channel_subscription', 'Channel Subscription', 'Credit-first remedy when creator obligations are not met during the paid period. Cash refund only if required by law, store, provider, or admin decision.', 'in_app_credit_review', array['not_started','access_granted'], array['consumed'], true, true, true, true, true, '{"creator_specific": true, "not_premium": true, "credit_first": true}'::jsonb),
  ('vip_pass', 'VIP Pass', 'Credit/refund review when creator deactivates/removes VIP access early, misrepresents VIP, or admin finds obligation failure. No standard refund after valid access period/use unless platform/admin/legal/provider decision.', 'in_app_credit_review', array['not_started','access_granted'], array['consumed'], true, true, true, true, true, '{"creator_specific": true, "separate_from_premium_and_subscription": true}'::jsonb),
  ('event_pass', 'Event Pass', 'Refund review when event is canceled, materially changed, unavailable, or buyer has not entered/attended before cutoff. No standard refund after attendance/entry unless platform fault or provider/legal/admin decision.', 'cash_refund_review', array['not_started','access_granted'], array['attended_event','consumed'], true, true, true, true, true, '{"access_scope": "one_event", "payout_hold_until_event_plus_window": true}'::jsonb),
  ('merch_physical_good', 'Physical Merch', 'Refund/return to original payment method according to merch return policy if not shipped, defective, not delivered, canceled, or eligible return.', 'provider_refund_required', array['not_started','fulfilled'], array['shipped','consumed'], true, true, true, true, true, '{"physical_product_only": true, "no_digital_access": true, "stripe_or_merch_provider_separate_from_android_digital": true}'::jsonb),
  ('payout_readiness', 'Payout Readiness', 'Setup/status only. Refund and credit rules must not make money payable while live money and payouts are off.', 'none', array[]::text[], array['consumed'], false, false, false, false, false, '{"setup_status_only": true, "cashout_enabled": false, "withdrawal_enabled": false, "real_payout_active": false}'::jsonb)
on conflict ("policy_key") do update
set
  "display_name" = excluded."display_name",
  "standard_refund_policy" = excluded."standard_refund_policy",
  "default_remedy" = excluded."default_remedy",
  "eligible_consumption_states" = excluded."eligible_consumption_states",
  "ineligible_consumption_states" = excluded."ineligible_consumption_states",
  "creator_obligation_required" = excluded."creator_obligation_required",
  "payout_hold_required" = excluded."payout_hold_required",
  "provider_action_required" = excluded."provider_action_required",
  "cash_refund_allowed_later" = excluded."cash_refund_allowed_later",
  "credit_allowed_later" = excluded."credit_allowed_later",
  "metadata" = excluded."metadata",
  "updated_at" = timezone('utc'::text, now());

create or replace function public."resolve_money_refund_policy"(
  policy_key text,
  consumption_state text default 'not_started',
  creator_obligation_state text default 'not_applicable',
  platform_fault boolean default false,
  provider_or_legal_required boolean default false
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_rule record;
  v_consumption text := coalesce(nullif(consumption_state, ''), 'not_started');
  v_obligation text := coalesce(nullif(creator_obligation_state, ''), 'not_applicable');
  v_refund boolean := false;
  v_credit boolean := false;
  v_cash boolean := false;
  v_admin boolean := false;
  v_provider boolean := false;
  v_hold boolean := false;
  v_reasons text[] := array[]::text[];
begin
  select *
  into v_rule
  from public."money_refund_policy_rules" r
  where r."policy_key" = resolve_money_refund_policy.policy_key
  limit 1;

  if not found then
    return jsonb_build_object(
      'refundEligibility', false,
      'creditEligibility', false,
      'cashRefundEligibility', false,
      'providerActionRequired', false,
      'adminReviewRequired', true,
      'creatorPayoutHoldRequired', false,
      'reasonCodes', array['unknown_policy_key'],
      'userFacingExplanation', 'Refund review is unavailable for this product.',
      'creatorFacingExplanation', 'No creator payout action is available.',
      'adminFacingExplanation', 'Unknown policy key. Add a policy rule before review.'
    );
  end if;

  v_provider := coalesce(provider_or_legal_required, false) or coalesce(v_rule."provider_action_required", false);
  v_admin := true;
  v_hold := coalesce(v_rule."payout_hold_required", false);

  if v_rule."policy_key" = 'premium_subscription' then
    v_refund := coalesce(platform_fault, false) or coalesce(provider_or_legal_required, false);
    v_cash := v_refund;
    v_reasons := array['premium_generally_non_refundable', 'platform_revenue_not_creator_income'];
  elsif v_rule."policy_key" = 'creator_tip' then
    v_refund := coalesce(platform_fault, false) or coalesce(provider_or_legal_required, false);
    v_cash := v_refund;
    v_reasons := array['tips_unlock_nothing', 'tips_no_standard_refunds', 'creator_payout_hold_required'];
  elsif v_rule."policy_key" = 'live_watch_party_seat_pass' then
    v_credit := v_consumption = 'seat_review_pending' or v_obligation in ('failed', 'review_required') or coalesce(platform_fault, false);
    v_refund := v_credit or coalesce(provider_or_legal_required, false);
    v_cash := coalesce(provider_or_legal_required, false) or coalesce(platform_fault, false);
    v_reasons := array['seat_eligibility_only', 'host_approval_still_wins', 'livekit_authority_rules_still_win'];
  elsif v_rule."policy_key" = 'channel_subscription' then
    v_credit := v_obligation in ('failed', 'review_required') or coalesce(platform_fault, false);
    v_refund := v_credit or coalesce(provider_or_legal_required, false);
    v_cash := coalesce(provider_or_legal_required, false);
    v_reasons := array['credit_first_remedy', 'creator_specific_subscription_not_premium'];
  elsif v_rule."policy_key" = 'vip_pass' then
    v_credit := v_obligation in ('failed', 'review_required') or coalesce(platform_fault, false);
    v_refund := v_credit or coalesce(provider_or_legal_required, false);
    v_cash := coalesce(provider_or_legal_required, false);
    v_reasons := array['creator_specific_vip', 'separate_from_subscription_and_premium'];
  elsif v_rule."policy_key" = 'payout_readiness' then
    v_refund := false;
    v_credit := false;
    v_cash := false;
    v_provider := false;
    v_admin := false;
    v_hold := false;
    v_reasons := array['setup_status_only', 'cashout_withdrawal_payout_inactive'];
  elsif v_consumption = any(v_rule."eligible_consumption_states") or coalesce(platform_fault, false) or v_obligation in ('failed', 'review_required') then
    v_refund := coalesce(v_rule."cash_refund_allowed_later", false) or coalesce(v_rule."credit_allowed_later", false);
    v_credit := coalesce(v_rule."credit_allowed_later", false);
    v_cash := coalesce(v_rule."cash_refund_allowed_later", false) and (coalesce(platform_fault, false) or coalesce(provider_or_legal_required, false) or v_consumption = 'not_started');
    v_reasons := array['eligible_before_meaningful_use_or_obligation_failure'];
  else
    v_refund := coalesce(provider_or_legal_required, false);
    v_credit := false;
    v_cash := coalesce(provider_or_legal_required, false);
    v_reasons := array['no_standard_refund_after_use'];
  end if;

  return jsonb_build_object(
    'refundEligibility', v_refund,
    'creditEligibility', v_credit,
    'cashRefundEligibility', v_cash,
    'providerActionRequired', v_provider and v_refund,
    'adminReviewRequired', v_admin and v_rule."policy_key" <> 'payout_readiness',
    'creatorPayoutHoldRequired', v_hold,
    'reasonCodes', v_reasons,
    'userFacingExplanation',
      case
        when v_rule."policy_key" = 'payout_readiness' then 'Payout readiness is setup/status only. No cash-out, withdrawal, payable balance, or real payout is active.'
        when v_refund or v_credit then 'This may qualify for review. No refund or credit is automatic, and provider/admin review may be required.'
        else 'No standard refund applies after access is used unless platform, provider, legal, or admin review requires it.'
      end,
    'creatorFacingExplanation',
      case
        when v_hold then 'Creator payout stays held until obligations and refund/chargeback windows clear. Payouts are not active today.'
        else 'No creator payout hold is needed for this policy, and payouts remain inactive.'
      end,
    'adminFacingExplanation',
      'Foundation-only policy result. It does not call providers, mark refunds complete, create spendable credits, or release payout holds.'
  );
end;
$$;

create or replace function public."resolve_creator_payout_hold_policy"(
  policy_key text,
  creator_obligation_state text default 'pending',
  refund_window_cleared boolean default false,
  chargeback_window_cleared boolean default false,
  payouts_enabled boolean default false,
  live_money_enabled boolean default false
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_key text := coalesce(nullif(policy_key, ''), 'payout_readiness');
  v_obligation text := coalesce(nullif(creator_obligation_state, ''), 'pending');
  v_hold_state text := 'hold_required';
  v_reasons text[] := array[]::text[];
begin
  if v_key in ('premium_subscription', 'payout_readiness') then
    v_hold_state := 'not_applicable';
    v_reasons := array['no_creator_payout_hold_needed'];
  elsif v_obligation in ('failed', 'review_required') then
    v_hold_state := 'blocked';
    v_reasons := array['creator_obligation_not_cleared'];
  elsif not refund_window_cleared or not chargeback_window_cleared then
    v_hold_state := 'held';
    v_reasons := array['refund_or_chargeback_window_open'];
  elsif not payouts_enabled or not live_money_enabled then
    v_hold_state := 'eligible_later';
    v_reasons := array['payouts_or_live_money_disabled'];
  else
    v_hold_state := 'released_later';
    v_reasons := array['future_release_requires_separate_approval_and_evidence'];
  end if;

  return jsonb_build_object(
    'payoutHoldState', v_hold_state,
    'creatorPayoutHoldRequired', v_hold_state in ('hold_required', 'held', 'blocked', 'eligible_later'),
    'canReleasePayoutNow', false,
    'reasonCodes', v_reasons,
    'creatorFacingExplanation', 'Payouts are not active. Funds cannot be called available until obligations, refund windows, live money, payout readiness, and owner approval all clear.',
    'adminFacingExplanation', 'Foundation-only payout-hold decision. It cannot release payable money in the current build.'
  );
end;
$$;

create or replace function public."create_refund_review_dry_run"(
  policy_key text,
  consumption_state text default 'not_started',
  creator_obligation_state text default 'not_applicable',
  source_type text default null,
  source_id uuid default null,
  creator_user_id uuid default null,
  amount_cents integer default 0,
  currency text default 'USD'
)
returns jsonb
language plpgsql
as $$
declare
  v_result jsonb;
  v_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'signed_in_required');
  end if;

  v_result := public."resolve_money_refund_policy"(policy_key, consumption_state, creator_obligation_state, false, false);

  insert into public."money_refund_review_records" (
    "policy_key",
    "requester_user_id",
    "buyer_user_id",
    "creator_user_id",
    "source_type",
    "source_id",
    "environment",
    "review_status",
    "consumption_state",
    "creator_obligation_state",
    "refund_remedy",
    "provider_refund_status",
    "amount_cents",
    "currency",
    "safe_reason_code",
    "safe_user_summary",
    "safe_creator_summary",
    "safe_admin_summary",
    "metadata"
  )
  values (
    policy_key,
    auth.uid(),
    auth.uid(),
    creator_user_id,
    source_type,
    source_id,
    'setup',
    'dry_run_only',
    consumption_state,
    creator_obligation_state,
    case
      when coalesce((v_result->>'cashRefundEligibility')::boolean, false) then 'cash_refund_review'
      when coalesce((v_result->>'creditEligibility')::boolean, false) then 'in_app_credit_review'
      else 'admin_review_required'
    end,
    'not_requested',
    greatest(coalesce(amount_cents, 0), 0),
    upper(coalesce(nullif(currency, ''), 'USD')),
    'foundation_dry_run',
    'Refund or credit review is setup-only. No provider refund, spendable credit, or money movement was created.',
    'Creator payout stays held or unavailable until obligations and refund windows clear. Payouts are not active.',
    'Dry-run review only. Provider evidence is required before future refund completion.',
    jsonb_build_object(
      'foundation_only', true,
      'dry_run_only', true,
      'provider_refund_created', false,
      'spendable_credit_created', false,
      'payout_released', false,
      'live_money_enabled', false
    )
  )
  returning "id" into v_id;

  return jsonb_build_object(
    'ok', true,
    'dryRunOnly', true,
    'reviewRecordId', v_id,
    'policyResult', v_result,
    'providerRefundCreated', false,
    'spendableCreditCreated', false,
    'payoutReleased', false
  );
end;
$$;

create or replace function public."get_my_refund_credit_summary"()
returns jsonb
language plpgsql
stable
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'signed_in_required');
  end if;

  return jsonb_build_object(
    'ok', true,
    'spendableCreditsActive', false,
    'creditsAreCash', false,
    'creditsTransferable', false,
    'creditsWithdrawable', false,
    'creditRows',
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', c."id",
          'policyKey', c."policy_key",
          'status', c."credit_status",
          'amountCents', c."amount_cents",
          'currency', c."currency",
          'spendable', c."spendable",
          'summary', c."safe_user_summary",
          'createdAt', c."created_at"
        ) order by c."created_at" desc)
        from public."money_credit_ledger_entries" c
        where c."user_id" = v_user
        limit 20
      ), '[]'::jsonb)
  );
end;
$$;

create or replace function public."admin_get_refund_readiness_summary"()
returns jsonb
language plpgsql
stable
as $$
begin
  if not public.has_platform_role(array['owner'::text, 'operator'::text]) then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  return jsonb_build_object(
    'ok', true,
    'foundationOnly', true,
    'liveMoneyEnabled', false,
    'payoutsEnabled', false,
    'providerRefundsExecuted', 0,
    'spendableCreditsActive', 0,
    'payableBalancesCreated', 0,
    'payoutHoldReleasesActive', 0,
    'policyRuleCount', (select count(*) from public."money_refund_policy_rules"),
    'reviewRecordCount', (select count(*) from public."money_refund_review_records"),
    'creditEntryCount', (select count(*) from public."money_credit_ledger_entries"),
    'spendableCreditEntryCount', (select count(*) from public."money_credit_ledger_entries" where "spendable" = true),
    'obligationReviewCount', (select count(*) from public."creator_obligation_review_records"),
    'payoutHoldRecordCount', (select count(*) from public."creator_payout_hold_records"),
    'releasedPayoutHoldCount', (select count(*) from public."creator_payout_hold_records" where "hold_state" = 'released_later')
  );
end;
$$;

revoke all on function public."resolve_money_refund_policy"(text, text, text, boolean, boolean) from "anon";
revoke all on function public."resolve_creator_payout_hold_policy"(text, text, boolean, boolean, boolean, boolean) from "anon";
revoke all on function public."create_refund_review_dry_run"(text, text, text, text, uuid, uuid, integer, text) from "anon";
revoke all on function public."get_my_refund_credit_summary"() from "anon";
revoke all on function public."admin_get_refund_readiness_summary"() from "anon";

grant execute on function public."resolve_money_refund_policy"(text, text, text, boolean, boolean) to "authenticated";
grant execute on function public."resolve_creator_payout_hold_policy"(text, text, boolean, boolean, boolean, boolean) to "authenticated";
grant execute on function public."create_refund_review_dry_run"(text, text, text, text, uuid, uuid, integer, text) to "authenticated";
grant execute on function public."get_my_refund_credit_summary"() to "authenticated";
grant execute on function public."admin_get_refund_readiness_summary"() to "authenticated";
