-- Chi'llywood creator-money refund, reversal, settlement, and payout doctrine.
-- Forward-only closure after 20260831120000_creator_access_product_doctrine_amendment.sql.

-- Policy rows are server-owned doctrine. Authenticated owner/operator sessions
-- may read them, but cannot mutate financial policy, credits, obligations, or
-- payout holds directly.
drop policy if exists "money_refund_policy_rules_write_owner_operator"
  on public."money_refund_policy_rules";
drop policy if exists "money_credit_ledger_entries_write_owner_operator"
  on public."money_credit_ledger_entries";
drop policy if exists "creator_obligation_review_records_write_owner_operator"
  on public."creator_obligation_review_records";
drop policy if exists "creator_payout_hold_records_write_owner_operator"
  on public."creator_payout_hold_records";

revoke insert, update, delete on public."money_refund_policy_rules" from authenticated;
revoke insert, update, delete on public."money_credit_ledger_entries" from authenticated;
revoke insert, update, delete on public."creator_obligation_review_records" from authenticated;
revoke insert, update, delete on public."creator_payout_hold_records" from authenticated;

update public."money_refund_policy_rules"
set "display_name" = case when "policy_key"='channel_subscription' then 'Platform Subscription' else "display_name" end,
"standard_refund_policy" = case "policy_key"
  when 'premium_subscription' then 'No ordinary Chi''llywood refund. Canceling stops future renewal; authoritative store/provider/legal/fraud/duplicate/unauthorized reversals reconcile.'
  when 'creator_tip' then 'Final and non-refundable through Chi''llywood. Authoritative fraud, duplicate, unauthorized, chargeback, provider, and legal reversals reconcile.'
  when 'paid_creator_video' then 'Review before meaningful playback for failed delivery, removal, platform fault, or material misrepresentation. No standard refund after playback begins.'
  when 'watch_party_ticket' then 'Review before meaningful entry for cancellation, unavailability, or creator/platform delivery failure. No standard refund after successful use.'
  when 'channel_subscription' then 'Canceling stops future renewal. No standard prorated refund for an already-started paid period; paid-through access follows provider truth.'
  when 'vip_pass' then 'Thirty-day exact-creator access. No standard refund after valid delivery; failed delivery, early removal, or material misrepresentation may be reviewed.'
  when 'event_pass' then 'Review before attendance for cancellation, material unavailability/change, or delivery failure. No standard refund after successful attendance.'
  else "standard_refund_policy"
end,
"default_remedy" = case
  when "policy_key" in ('premium_subscription','creator_tip','payout_readiness') then 'none'
  when "policy_key" in ('channel_subscription','vip_pass') then 'cash_refund_review'
  else "default_remedy"
end,
"eligible_consumption_states" = case
  when "policy_key" in ('premium_subscription','creator_tip') then '{}'::text[]
  else "eligible_consumption_states"
end,
"creator_obligation_required" = case
  when "policy_key" in ('premium_subscription','creator_tip','payout_readiness') then false
  else "creator_obligation_required"
end,
"credit_allowed_later" = case
  when "policy_key" in ('channel_subscription','vip_pass') then false
  else "credit_allowed_later"
end,
"cash_refund_allowed_later" = case
  when "policy_key" in ('premium_subscription','creator_tip') then false
  when "policy_key" in ('channel_subscription','vip_pass') then true
  else "cash_refund_allowed_later"
end,
"metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object(
  'doctrine_version','2026-08-31-refund-settlement-v1',
  'provider_reversal_separate_from_standard_refund',true
),
"updated_at" = timezone('utc'::text, now())
where "policy_key" in (
  'premium_subscription','creator_tip','paid_creator_video','watch_party_ticket',
  'channel_subscription','vip_pass','event_pass','payout_readiness'
);

-- Preserve internal channel_subscription identifiers while reconciling only
-- canonical user-facing defaults and existing default-derived rows.
alter table public."creator_channel_subscription_offers"
  alter column "title" set default 'Platform subscription';
update public."creator_channel_subscription_offers"
set "title"='Platform subscription',"updated_at"=timezone('utc'::text,now())
where lower(pg_catalog.btrim("title"))='channel subscription';
update public."monetization_products"
set "display_name"='Platform Subscription',"updated_at"=timezone('utc'::text,now())
where "product_type"='channel_subscription'
  and lower(pg_catalog.btrim("display_name"))='channel subscription';

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
security definer
set search_path = ''
as $$
declare
  v_rule public."money_refund_policy_rules"%rowtype;
  v_consumption text := coalesce(nullif(pg_catalog.btrim(consumption_state),''),'not_started');
  v_obligation text := coalesce(nullif(pg_catalog.btrim(creator_obligation_state),''),'not_applicable');
  v_standard boolean := false;
  v_credit boolean := false;
  v_cash boolean := false;
  v_provider boolean := coalesce(provider_or_legal_required,false);
  v_reasons text[] := array[]::text[];
begin
  select rule.* into v_rule
  from public."money_refund_policy_rules" rule
  where rule."policy_key" = resolve_money_refund_policy.policy_key;

  if v_rule."id" is null then
    return jsonb_build_object(
      'standardRefundReviewEligible',false,'authoritativeReversalRequired',false,
      'refundEligibility',false,'creditEligibility',false,'cashRefundEligibility',false,
      'providerActionRequired',false,'adminReviewRequired',true,
      'creatorPayoutHoldRequired',false,'reasonCodes',array['unknown_policy_key'],
      'userFacingExplanation','Remedy review is unavailable for this product.'
    );
  end if;

  if v_rule."policy_key" = 'payout_readiness' then
    v_reasons := array['setup_status_only','cashout_withdrawal_payout_inactive'];
  elsif v_provider then
    v_reasons := array['authoritative_provider_or_legal_reversal','not_a_standard_chillywood_refund'];
  elsif v_rule."policy_key" in ('premium_subscription','creator_tip') then
    v_reasons := case when v_rule."policy_key"='creator_tip'
      then array['tips_unlock_nothing','tips_final_non_refundable_through_chillywood']
      else array['premium_no_standard_chillywood_refund','cancel_is_not_refund'] end;
  elsif coalesce(platform_fault,false)
    or v_obligation in ('failed','review_required')
    or v_consumption = any(v_rule."eligible_consumption_states")
  then
    v_standard := coalesce(v_rule."cash_refund_allowed_later",false)
      or coalesce(v_rule."credit_allowed_later",false);
    v_credit := v_standard and coalesce(v_rule."credit_allowed_later",false);
    v_cash := v_standard and coalesce(v_rule."cash_refund_allowed_later",false);
    v_reasons := array['standard_remedy_review_before_meaningful_use_or_delivery_failure'];
  else
    v_reasons := array['no_standard_refund_after_meaningful_use'];
  end if;

  return jsonb_build_object(
    'standardRefundReviewEligible',v_standard,
    'authoritativeReversalRequired',v_provider and coalesce(v_rule."provider_action_required",false),
    'refundEligibility',v_standard,
    'creditEligibility',v_credit,
    'cashRefundEligibility',v_cash,
    'providerActionRequired',v_provider and coalesce(v_rule."provider_action_required",false),
    'adminReviewRequired',v_standard or v_provider,
    'creatorPayoutHoldRequired',coalesce(v_rule."payout_hold_required",false),
    'reasonCodes',v_reasons,
    'userFacingExplanation',case
      when v_provider then 'This authoritative store, provider, or legal reversal is separate from Chi''llywood''s standard refund policy.'
      when v_standard then 'This may qualify for standard remedy review. No refund is automatic.'
      else v_rule."standard_refund_policy" end,
    'creatorFacingExplanation',case
      when v_rule."payout_hold_required" then 'Earnings begin Pending and only server-owned settlement, obligation, reserve, and reversal rules can make funds Available.'
      else 'This product creates no creator earnings or payout hold.' end,
    'adminFacingExplanation','Policy resolution performs no provider mutation, credit issuance, ledger transition, or payout release.'
  );
end;
$$;


-- Payout request sizing and allocation use the same reserve-aware server helper
-- as balance readback and the allocation trigger. This preserves valid
-- multi-earning payouts while preventing Reserved cents from entering a request.
create or replace function public."create_creator_payout_request_safe"(
  p_amount_cents integer,
  p_payout_type text default 'scheduled'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_type text := lower(trim(coalesce(p_payout_type, 'scheduled')));
  v_session jsonb := public."wave1_session_authority_readback"();
  v_legal jsonb;
  v_available bigint := 0;
  v_fee integer;
  v_request public."creator_payout_requests"%rowtype;
  v_live text;
  v_payouts text;
  v_connect text;
  v_cashout text;
  v_now timestamptz := timezone('utc'::text, now());
  v_remaining integer;
  v_unallocated integer;
  v_row record;
begin
  if public."revenuecat_authority_quarantined_internal"(null,null,null) then
    raise exception 'revenuecat_terminal_authority_quarantined';
  end if;
  if v_user is null
    or v_session->>'state' <> 'ACTIVE'
    or coalesce((v_session->>'restoreOnly')::boolean, false)
    or (v_session->>'userId')::uuid is distinct from v_user
    or nullif(v_session->>'sessionGeneration', '') is null
    or nullif(auth.jwt()->>'session_id', '') is null
    or nullif(v_session->>'sessionGeneration', '') is distinct from nullif(auth.jwt()->>'session_id', '')
    or public."is_account_access_restricted"(v_user::text)
  then
    raise exception 'payout_session_authority_required';
  end if;
  if coalesce(p_amount_cents, 0) <= 0 then raise exception 'payout_amount_invalid'; end if;
  if v_type not in ('scheduled','instant') then raise exception 'payout_type_invalid'; end if;

  -- Serialize before reading any mutable admission evidence. Every predicate
  -- below is evaluated after the creator lock, so a caller that waited behind a
  -- reversal/recovery cannot reserve against a pre-wait snapshot.
  perform pg_advisory_xact_lock(hashtextextended('creator-payout:' || v_user::text, 0));
  v_now:=timezone('utc'::text,now());

  v_legal := public."wave1_legal_requirements_readback"('payout');
  if coalesce((v_legal->>'allAccepted')::boolean, false) is not true
    or v_legal->>'market' <> 'UNITED_STATES'
  then
    raise exception 'payout_legal_not_current';
  end if;
  if not exists (
    select 1
    from public."wave1_creator_eligibility" eligibility
    where eligibility."creator_user_id" = v_user
      and eligibility."state" = 'VERIFIED'
      and eligibility."account_status" = 'ACTIVE'
      and eligibility."age_18_plus"
      and eligibility."legal_accepted"
      and eligibility."creator_role"
      and eligibility."moderation_state" = 'CLEAR'
      and eligibility."market" = 'UNITED_STATES'
      and eligibility."rollout_eligible"
      and eligibility."platform_capability"
      and eligibility."provider_eligible"
      and eligibility."kyc_complete"
      and eligibility."tax_complete"
      and eligibility."sanctions_clear"
      and eligibility."payout_eligible"
  ) then
    raise exception 'creator_not_payout_eligible';
  end if;

  select "state" into v_live from public."platform_money_kill_switches" where "key" = 'live_money_enabled';
  select "state" into v_payouts from public."platform_money_kill_switches" where "key" = 'payouts_enabled';
  select "state" into v_connect from public."platform_money_kill_switches" where "key" = 'stripe_connect_enabled';
  select "state" into v_cashout from public."platform_money_kill_switches" where "key" = 'cashout_enabled';
  if coalesce(v_live, 'off') <> 'on'
    or coalesce(v_payouts, 'off') <> 'on'
    or coalesce(v_connect, 'off') <> 'on'
    or (v_type = 'instant' and coalesce(v_cashout, 'off') <> 'on')
  then
    raise exception 'payout_execution_disabled';
  end if;
  if not exists (
    select 1
    from public."creator_payout_accounts" account
    join public."platform_admin_audit_logs" audit
      on audit."id" = account."last_platform_admin_audit_log_id"
    where account."creator_user_id" = v_user::text
      and account."provider" = 'stripe_connect'
      and account."provider_environment" = 'live'
      and nullif(trim(account."provider_account_id"), '') is not null
      and lower(account."default_currency") = 'usd'
      and upper(coalesce(account."country", '')) = 'US'
      and account."status" = 'eligible'
      and account."payouts_enabled"
      and account."details_submitted"
      and account."transfers_capability_status" = 'active'
      and account."onboarding_status" = 'ready_for_payouts'
      and account."kyc_status" = 'verified'
      and account."tax_status" = 'verified'
      and nullif(trim(coalesce(account."disabled_reason", '')), '') is null
      and jsonb_typeof(account."requirements_currently_due") = 'array'
      and jsonb_array_length(account."requirements_currently_due") = 0
      and jsonb_typeof(account."requirements_eventually_due") = 'array'
      and jsonb_array_length(account."requirements_eventually_due") = 0
      and jsonb_typeof(account."requirements_past_due") = 'array'
      and jsonb_array_length(account."requirements_past_due") = 0
      and account."last_provider_sync_at" >= v_now - interval '15 minutes'
      and account."last_provider_sync_at" <= v_now + interval '2 minutes'
      and account."metadata"->>'last_provider_sync_source' in (
        'stripe-connect-account-sync',
        'stripe-connect-webhook'
      )
      and audit."action" in ('stripe_connect_account_synced','stripe_connect_webhook_processed')
      and audit."target_type" = 'creator_payout_account'
      and audit."target_id" = account."id"::text
      and audit."target_user_id" = v_user::text
      and audit."created_at" >= v_now - interval '15 minutes'
      and audit."created_at" <= v_now + interval '2 minutes'
  ) then
    raise exception 'fresh_live_payout_provider_proof_required';
  end if;
  if exists (
    select 1 from public."creator_money_recovery_obligations"
    where "creator_id" = v_user and "state" = 'pending_recovery'
  ) then
    raise exception 'creator_recovery_obligation_pending';
  end if;

  -- Re-read every mutable admission predicate immediately before balance and
  -- allocation. Lock the exact imported provider proof and switch rows so they
  -- cannot be downgraded between validation and request reservation.
  v_session:=public."wave1_session_authority_readback"();
  if public."revenuecat_authority_quarantined_internal"(null,null,null)
    or v_session->>'state'<>'ACTIVE'
    or coalesce((v_session->>'restoreOnly')::boolean,false)
    or (v_session->>'userId')::uuid is distinct from v_user
    or nullif(v_session->>'sessionGeneration','') is distinct from nullif(auth.jwt()->>'session_id','')
    or public."is_account_access_restricted"(v_user::text)
  then
    raise exception 'payout_session_authority_required';
  end if;
  v_legal:=public."wave1_legal_requirements_readback"('payout');
  if coalesce((v_legal->>'allAccepted')::boolean,false) is not true
    or v_legal->>'market'<>'UNITED_STATES'
  then
    raise exception 'payout_legal_not_current';
  end if;
  perform 1
  from public."wave1_creator_eligibility" eligibility
  where eligibility."creator_user_id"=v_user
    and eligibility."state"='VERIFIED' and eligibility."account_status"='ACTIVE'
    and eligibility."age_18_plus" and eligibility."legal_accepted"
    and eligibility."creator_role" and eligibility."moderation_state"='CLEAR'
    and eligibility."market"='UNITED_STATES' and eligibility."rollout_eligible"
    and eligibility."platform_capability" and eligibility."provider_eligible"
    and eligibility."kyc_complete" and eligibility."tax_complete"
    and eligibility."sanctions_clear" and eligibility."payout_eligible"
  for share;
  if not found then raise exception 'creator_not_payout_eligible'; end if;
  perform 1 from public."platform_money_kill_switches" switch_row
  where switch_row."key" in ('live_money_enabled','payouts_enabled','stripe_connect_enabled','cashout_enabled')
  for share;
  select "state" into v_live from public."platform_money_kill_switches" where "key"='live_money_enabled';
  select "state" into v_payouts from public."platform_money_kill_switches" where "key"='payouts_enabled';
  select "state" into v_connect from public."platform_money_kill_switches" where "key"='stripe_connect_enabled';
  select "state" into v_cashout from public."platform_money_kill_switches" where "key"='cashout_enabled';
  if coalesce(v_live,'off')<>'on' or coalesce(v_payouts,'off')<>'on'
    or coalesce(v_connect,'off')<>'on'
    or (v_type='instant' and coalesce(v_cashout,'off')<>'on')
  then raise exception 'payout_execution_disabled'; end if;
  perform account."id"
  from public."creator_payout_accounts" account
  join public."platform_admin_audit_logs" audit
    on audit."id"=account."last_platform_admin_audit_log_id"
  where account."creator_user_id"=v_user::text
    and account."provider"='stripe_connect' and account."provider_environment"='live'
    and nullif(trim(account."provider_account_id"),'') is not null
    and lower(account."default_currency")='usd' and upper(coalesce(account."country",''))='US'
    and account."status"='eligible' and account."payouts_enabled" and account."details_submitted"
    and account."transfers_capability_status"='active'
    and account."onboarding_status"='ready_for_payouts'
    and account."kyc_status"='verified' and account."tax_status"='verified'
    and nullif(trim(coalesce(account."disabled_reason",'')),'') is null
    and jsonb_typeof(account."requirements_currently_due")='array'
    and jsonb_array_length(account."requirements_currently_due")=0
    and jsonb_typeof(account."requirements_eventually_due")='array'
    and jsonb_array_length(account."requirements_eventually_due")=0
    and jsonb_typeof(account."requirements_past_due")='array'
    and jsonb_array_length(account."requirements_past_due")=0
    and account."last_provider_sync_at">=v_now-interval '15 minutes'
    and account."last_provider_sync_at"<=v_now+interval '2 minutes'
    and account."metadata"->>'last_provider_sync_source' in ('stripe-connect-account-sync','stripe-connect-webhook')
    and audit."action" in ('stripe_connect_account_synced','stripe_connect_webhook_processed')
    and audit."target_type"='creator_payout_account' and audit."target_id"=account."id"::text
    and audit."target_user_id"=v_user::text
    and audit."created_at">=v_now-interval '15 minutes' and audit."created_at"<=v_now+interval '2 minutes'
  for share of account,audit;
  if not found then raise exception 'fresh_live_payout_provider_proof_required'; end if;
  if exists (
    select 1 from public."creator_money_recovery_obligations"
    where "creator_id" = v_user and "state" = 'pending_recovery'
  ) then
    raise exception 'creator_recovery_obligation_pending';
  end if;
  select coalesce(sum(greatest(
    0,
    public."creator_earnings_withdrawable_cents_internal"(earnings."id",v_now)
      - coalesce(allocated."amount_cents", 0)
  )), 0) into v_available
  from public."creator_earnings_ledger" earnings
  join public."money_access_ledger_events" money
    on money."id" = earnings."money_ledger_event_id"
  left join (
    select allocation."earnings_ledger_id", sum(allocation."amount_cents") as amount_cents
    from public."creator_payout_allocations" allocation
    where allocation."state" in ('reserved','processing','paid')
    group by allocation."earnings_ledger_id"
  ) allocated on allocated."earnings_ledger_id" = earnings."id"
  where earnings."creator_id" = v_user
    and earnings."currency" = 'usd'
    and public."creator_earnings_current_state_internal"(earnings."id") = 'available'
    and money."environment" = 'production'
    and money."status" = 'verified'
    and money."payable_state" = 'payable';
  if v_available < p_amount_cents then raise exception 'insufficient_available_balance'; end if;

  v_fee := case when v_type = 'instant' then ceil(p_amount_cents * 0.015)::integer else 0 end;
  insert into public."creator_payout_requests" (
    "creator_id","amount_cents","currency","payout_type","instant_fee_cents","status"
  ) values (
    v_user,p_amount_cents,'usd',v_type,v_fee,'requested'
  ) returning * into v_request;

  v_remaining := p_amount_cents;
  for v_row in
    select
      earnings."id",
      greatest(
        0,
        public."creator_earnings_withdrawable_cents_internal"(earnings."id",v_now)
          - coalesce(allocated."amount_cents", 0)
      ) as unallocated
    from public."creator_earnings_ledger" earnings
    join public."money_access_ledger_events" money
      on money."id" = earnings."money_ledger_event_id"
    left join (
      select allocation."earnings_ledger_id", sum(allocation."amount_cents") as amount_cents
      from public."creator_payout_allocations" allocation
      where allocation."state" in ('reserved','processing','paid')
      group by allocation."earnings_ledger_id"
    ) allocated on allocated."earnings_ledger_id" = earnings."id"
    where earnings."creator_id" = v_user
      and earnings."currency" = 'usd'
      and public."creator_earnings_current_state_internal"(earnings."id") = 'available'
      and money."environment" = 'production'
      and money."status" = 'verified'
      and money."payable_state" = 'payable'
      and public."creator_earnings_withdrawable_cents_internal"(earnings."id",v_now)
        - coalesce(allocated."amount_cents", 0) > 0
    order by earnings."created_at", earnings."id"
    for update of earnings
  loop
    exit when v_remaining <= 0;
    v_unallocated := least(v_remaining, v_row."unallocated");
    insert into public."creator_payout_allocations" (
      "payout_request_id","earnings_ledger_id","amount_cents","state"
    ) values (
      v_request."id",v_row."id",v_unallocated,'reserved'
    );
    v_remaining := v_remaining - v_unallocated;
  end loop;
  if v_remaining <> 0 then raise exception 'payout_allocation_incomplete'; end if;

  return jsonb_build_object(
    'id',v_request."id",'status',v_request."status",'amountCents',v_request."amount_cents",
    'currency',v_request."currency",'instantFeeCents',v_request."instant_fee_cents",
    'providerMutationPerformed',false
  );
end;
$$;
revoke all on function public."create_creator_payout_request_safe"(integer,text) from public, anon;
grant execute on function public."create_creator_payout_request_safe"(integer,text) to authenticated, service_role;


-- Settlement policy is durable, auditable, and server-owned. The 10% reserve
-- is withheld from otherwise payout-eligible earnings for 30 days. Event and
-- Watch-Party earnings do not start their 48-hour hold until a canonical
-- completion receipt exists.
create table if not exists public."creator_money_settlement_policies" (
  "source_type" text primary key,
  "normal_hold" interval,
  "requires_obligation_completion" boolean not null,
  "post_completion_hold" interval,
  "reserve_basis_points" integer not null,
  "reserve_duration" interval not null,
  "policy_version" text not null,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "creator_money_settlement_policy_source_check" check (
    "source_type" in ('tip','paid_content','channel_subscription','vip_pass','watch_party_ticket','event_pass')
  ),
  constraint "creator_money_settlement_policy_hold_check" check (
    ("requires_obligation_completion" and "normal_hold" is null and "post_completion_hold" = interval '48 hours')
    or (not "requires_obligation_completion" and "normal_hold" = interval '7 days' and "post_completion_hold" is null)
  ),
  constraint "creator_money_settlement_policy_reserve_check" check (
    "reserve_basis_points" = 1000 and "reserve_duration" = interval '30 days'
  )
);

insert into public."creator_money_settlement_policies" (
  "source_type","normal_hold","requires_obligation_completion","post_completion_hold",
  "reserve_basis_points","reserve_duration","policy_version"
)
values
  ('tip',interval '7 days',false,null,1000,interval '30 days','2026-08-31-v1'),
  ('paid_content',interval '7 days',false,null,1000,interval '30 days','2026-08-31-v1'),
  ('channel_subscription',interval '7 days',false,null,1000,interval '30 days','2026-08-31-v1'),
  ('vip_pass',interval '7 days',false,null,1000,interval '30 days','2026-08-31-v1'),
  ('watch_party_ticket',null,true,interval '48 hours',1000,interval '30 days','2026-08-31-v1'),
  ('event_pass',null,true,interval '48 hours',1000,interval '30 days','2026-08-31-v1')
on conflict ("source_type") do update set
  "normal_hold"=excluded."normal_hold",
  "requires_obligation_completion"=excluded."requires_obligation_completion",
  "post_completion_hold"=excluded."post_completion_hold",
  "reserve_basis_points"=excluded."reserve_basis_points",
  "reserve_duration"=excluded."reserve_duration",
  "policy_version"=excluded."policy_version";

alter table public."creator_money_settlement_policies" enable row level security;
alter table public."creator_money_settlement_policies" force row level security;
revoke all on public."creator_money_settlement_policies" from public, anon, authenticated, service_role;
grant select on public."creator_money_settlement_policies" to authenticated;
create policy "creator_money_settlement_policies_read"
  on public."creator_money_settlement_policies" for select to authenticated using (true);

alter table public."creator_earnings_ledger"
  add column if not exists "settlement_started_at" timestamptz,
  add column if not exists "normal_eligible_at" timestamptz,
  add column if not exists "reserve_amount_cents" integer,
  add column if not exists "reserve_release_at" timestamptz,
  add column if not exists "settlement_policy_version" text;

alter table public."creator_earnings_ledger"
  drop constraint if exists "creator_earnings_reserve_amount_check";
alter table public."creator_earnings_ledger"
  add constraint "creator_earnings_reserve_amount_check" check (
    "reserve_amount_cents" is null
    or "reserve_amount_cents" between 0 and "net_creator_amount_cents"
  );
alter table public."creator_earnings_ledger"
  drop constraint if exists "creator_earnings_settlement_dates_check";
alter table public."creator_earnings_ledger"
  add constraint "creator_earnings_settlement_dates_check" check (
    "settlement_started_at" is null
    or (
      "settlement_policy_version" is not null
      and ("normal_eligible_at" is null or "normal_eligible_at" >= "settlement_started_at")
      and ("reserve_release_at" is null or "reserve_release_at" >= "settlement_started_at")
    )
  );

create table if not exists public."creator_money_obligation_completion_receipts" (
  "id" uuid primary key default gen_random_uuid(),
  "earnings_ledger_id" uuid not null unique references public."creator_earnings_ledger"("id") on delete restrict,
  "creator_id" uuid not null,
  "source_type" text not null,
  "source_id" uuid not null,
  "completed_at" timestamptz not null default timezone('utc'::text, now()),
  "evidence_source" text not null,
  "evidence_hash" text not null,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "creator_money_obligation_completion_source_check" check (
    "source_type" in ('watch_party_ticket','event_pass')
  ),
  constraint "creator_money_obligation_completion_evidence_source_check" check (
    "evidence_source" in ('canonical_event_lifecycle','canonical_watch_party_lifecycle')
  ),
  constraint "creator_money_obligation_completion_evidence_hash_check" check (
    "evidence_hash" ~ '^[0-9a-f]{64}$'
  )
);

alter table public."creator_money_obligation_completion_receipts" enable row level security;
alter table public."creator_money_obligation_completion_receipts" force row level security;
revoke all on public."creator_money_obligation_completion_receipts" from public, anon, authenticated, service_role;
create index "creator_money_obligation_completion_creator_idx"
  on public."creator_money_obligation_completion_receipts"("creator_id","completed_at" desc);

create or replace function public."block_creator_money_obligation_completion_mutation_internal"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'creator_money_obligation_completion_receipt_is_immutable';
end;
$$;
create trigger "block_creator_money_obligation_completion_update"
before update on public."creator_money_obligation_completion_receipts"
for each row execute function public."block_creator_money_obligation_completion_mutation_internal"();
create trigger "block_creator_money_obligation_completion_delete"
before delete on public."creator_money_obligation_completion_receipts"
for each row execute function public."block_creator_money_obligation_completion_mutation_internal"();
revoke all on function public."block_creator_money_obligation_completion_mutation_internal"()
  from public, anon, authenticated, service_role;

create or replace function public."record_creator_money_obligation_completion"(
  p_earnings_ledger_id uuid,
  p_evidence_source text,
  p_evidence_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_earning public."creator_earnings_ledger"%rowtype;
  v_existing public."creator_money_obligation_completion_receipts"%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
  v_valid boolean := false;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  if p_earnings_ledger_id is null
    or p_evidence_hash is null or p_evidence_hash !~ '^[0-9a-f]{64}$'
    or p_evidence_source not in ('canonical_event_lifecycle','canonical_watch_party_lifecycle')
  then raise exception 'obligation_completion_evidence_invalid'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'creator-money-obligation-completion:' || p_earnings_ledger_id::text,0
  ));
  select earning.* into v_earning
  from public."creator_earnings_ledger" earning
  where earning."id"=p_earnings_ledger_id for update;
  if v_earning."id" is null
    or v_earning."source_type" not in ('watch_party_ticket','event_pass')
    or v_earning."source_id" is null
    or v_earning."settlement_policy_version" <> '2026-08-31-v1'
  then raise exception 'obligation_completion_earning_invalid'; end if;
  if public."creator_earnings_current_state_internal"(v_earning."id")='reversed'
  then raise exception 'obligation_completion_earning_reversed'; end if;

  if v_earning."source_type"='event_pass' and p_evidence_source='canonical_event_lifecycle' then
    select exists (
      select 1 from public."paid_creator_events" offer
      join public."creator_events" event on event."id"=offer."creator_event_id"
      where offer."creator_event_id"=v_earning."source_id"
        and offer."creator_id"=v_earning."creator_id"
        and offer."status" not in ('canceled','blocked','archived')
        and event."host_user_id"=v_earning."creator_id"
        and event."status" in ('ended','replay_available')
        and event."ends_at" is not null and event."ends_at"<=v_now
    ) into v_valid;
  elsif v_earning."source_type"='watch_party_ticket'
    and p_evidence_source='canonical_watch_party_lifecycle'
  then
    select exists (
      select 1 from public."paid_watch_party_offers" offer
      join public."watch_party_rooms" room on room."party_id"=offer."party_id"
      where offer."id"=v_earning."source_id"
        and offer."creator_id"=v_earning."creator_id"
        and offer."status" not in ('canceled','blocked','archived')
        and offer."ends_at" is not null and offer."ends_at"<=v_now
        and not coalesce(room."is_active",true)
    ) into v_valid;
  end if;
  if not v_valid then raise exception 'canonical_obligation_not_successfully_completed'; end if;

  select receipt.* into v_existing
  from public."creator_money_obligation_completion_receipts" receipt
  where receipt."earnings_ledger_id"=v_earning."id";
  if v_existing."id" is not null then
    if v_existing."evidence_source" is distinct from p_evidence_source
      or v_existing."evidence_hash" is distinct from p_evidence_hash
    then raise exception 'obligation_completion_replay_mismatch'; end if;
    return jsonb_build_object('status','already_recorded','receiptId',v_existing."id",
      'completedAt',v_existing."completed_at");
  end if;

  insert into public."creator_money_obligation_completion_receipts"(
    "earnings_ledger_id","creator_id","source_type","source_id",
    "completed_at","evidence_source","evidence_hash"
  ) values (
    v_earning."id",v_earning."creator_id",v_earning."source_type",v_earning."source_id",
    v_now,p_evidence_source,p_evidence_hash
  ) returning * into v_existing;
  return jsonb_build_object('status','recorded','receiptId',v_existing."id",
    'completedAt',v_existing."completed_at");
end;
$$;

revoke all on function public."record_creator_money_obligation_completion"(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public."record_creator_money_obligation_completion"(uuid,text,text)
  to service_role;

create or replace function public."finalize_creator_money_settlement_provider_closeout_internal"(
  p_money_ledger_event_id uuid,
  p_creator_net_minor integer,
  p_provider_fee_minor integer,
  p_settlement_reference_hash text,
  p_hold_days integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_money public."money_access_ledger_events"%rowtype;
  v_provider public."provider_events"%rowtype;
  v_product public."monetization_products"%rowtype;
  v_earning public."creator_earnings_ledger"%rowtype;
  v_policy public."creator_money_settlement_policies"%rowtype;
  v_now timestamptz:=timezone('utc'::text,now());
  v_platform_fee integer;
  v_source_type text;
  v_live_state text;
  v_normal_eligible_at timestamptz;
  v_reserve_release_at timestamptz;
  v_reserve integer;
begin
  if p_hold_days is not null then raise exception 'caller_hold_days_not_allowed'; end if;
  if p_money_ledger_event_id is null then raise exception 'money_ledger_event_required'; end if;
  if p_creator_net_minor is null or p_creator_net_minor<0 then raise exception 'creator_net_invalid'; end if;
  if p_provider_fee_minor is null or p_provider_fee_minor<0 then raise exception 'provider_fee_invalid'; end if;
  if coalesce(p_settlement_reference_hash,'') !~ '^[0-9a-f]{64}$'
  then raise exception 'settlement_reference_hash_invalid'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'creator-money-settlement:'||p_money_ledger_event_id::text,0
  ));
  select money.* into v_money from public."money_access_ledger_events" money
  where money."id"=p_money_ledger_event_id for update;
  if v_money."id" is null then raise exception 'money_ledger_event_not_found'; end if;
  if v_money."environment"<>'production' or v_money."status"<>'verified'
    or v_money."payable_state"<>'pending_verification'
  then raise exception 'money_ledger_event_not_settlement_eligible'; end if;
  if v_money."creator_id" is null or v_money."provider_event_id" is null
    or v_money."product_id" is null
    or nullif(v_money."metadata"->>'purchase_intent_id','') is null
    or nullif(v_money."metadata"->>'original_transaction_id','') is null
  then raise exception 'money_ledger_event_binding_incomplete'; end if;
  if p_creator_net_minor+p_provider_fee_minor>v_money."amount_minor"
  then raise exception 'settlement_amounts_exceed_gross'; end if;

  select provider_event.* into v_provider from public."provider_events" provider_event
  where provider_event."id"=v_money."provider_event_id" for update;
  if v_provider."id" is null
    or v_provider."provider" not in ('revenuecat_app_store','revenuecat_google_play')
    or v_provider."environment"<>'production' or v_provider."status"<>'processed'
    or v_provider."occurred_at" is null
    or v_provider."occurred_at">v_now+interval '2 minutes'
    or v_provider."user_id" is distinct from v_money."user_id"
    or v_provider."product_id" is distinct from v_money."product_id"
    or v_provider."metadata"->>'purchase_intent_id' is distinct from v_money."metadata"->>'purchase_intent_id'
    or v_provider."metadata"->>'original_transaction_id' is distinct from v_money."metadata"->>'original_transaction_id'
  then raise exception 'provider_event_not_settlement_eligible'; end if;
  if public."revenuecat_authority_quarantined_internal"(
    v_provider."provider",v_provider."user_id",v_provider."environment"
  ) then raise exception 'revenuecat_terminal_authority_quarantined'; end if;
  if not exists (
    select 1
    from public."revenuecat_consumable_transaction_intents" transaction_link
    join public."money_purchase_intents" intent on intent."id"=transaction_link."purchase_intent_id"
    where transaction_link."provider"=v_provider."provider"
      and transaction_link."original_transaction_id"=v_provider."metadata"->>'original_transaction_id'
      and transaction_link."binding_state"='exact' and not transaction_link."terminal"
      and intent."id"::text=v_provider."metadata"->>'purchase_intent_id'
      and intent."user_id"=v_money."user_id" and intent."creator_id"=v_money."creator_id"
      and intent."product_id"=v_money."product_id" and intent."source_type"=v_money."source_type"
      and intent."source_id"=v_money."source_id" and intent."provider"=v_provider."provider"
      and intent."provider_product_id"=v_provider."metadata"->>'provider_product_id'
      and intent."environment"='production' and intent."status"='consumed'
  ) then raise exception 'settlement_original_transaction_binding_invalid'; end if;

  select product.* into v_product from public."monetization_products" product
  where product."id"=v_money."product_id";
  if v_product."id" is null or v_product."product_type"='premium_subscription'
  then raise exception 'settlement_product_not_creator_money'; end if;
  v_source_type:=public."creator_money_source_type_for_product"(v_product."product_type");
  select policy.* into v_policy from public."creator_money_settlement_policies" policy
  where policy."source_type"=v_source_type;
  if v_policy."source_type" is null then raise exception 'settlement_policy_missing'; end if;

  select "state" into v_live_state from public."platform_money_kill_switches"
  where "key"='live_money_enabled';
  if coalesce(v_live_state,'off')<>'on' then raise exception 'live_money_not_enabled_for_settlement'; end if;

  v_platform_fee:=v_money."amount_minor"-p_provider_fee_minor-p_creator_net_minor;
  if v_source_type='tip' and v_platform_fee<>0 then raise exception 'creator_tip_platform_fee_must_be_zero'; end if;
  v_normal_eligible_at:=case when v_policy."requires_obligation_completion" then null
    else v_provider."occurred_at"+v_policy."normal_hold" end;
  v_reserve:=least(p_creator_net_minor,
    ceiling(p_creator_net_minor::numeric*v_policy."reserve_basis_points"/10000.0)::integer);
  v_reserve_release_at:=case when v_normal_eligible_at is null then null
    else v_normal_eligible_at+v_policy."reserve_duration" end;

  select earning.* into v_earning from public."creator_earnings_ledger" earning
  where earning."money_ledger_event_id"=v_money."id" for update;
  if v_earning."id" is not null then
    if v_earning."settlement_reference_hash"<>p_settlement_reference_hash
      or v_earning."net_creator_amount_cents"<>p_creator_net_minor
      or v_earning."provider_fee_cents"<>p_provider_fee_minor
      or v_earning."settlement_started_at" is distinct from v_provider."occurred_at"
    then raise exception 'settlement_replay_mismatch'; end if;
    return jsonb_build_object('status','already_settled','earningsLedgerId',v_earning."id",
      'ledgerStatus',public."creator_earnings_current_state_internal"(v_earning."id"),
      'normalEligibleAt',v_earning."normal_eligible_at",'reserveReleaseAt',v_earning."reserve_release_at");
  end if;

  insert into public."creator_earnings_ledger"(
    "creator_id","source_type","source_id","gross_amount_cents","platform_fee_cents",
    "provider_fee_cents","tax_cents","net_creator_amount_cents","currency","ledger_status",
    "hold_until","metadata","provider_event_id","money_ledger_event_id","settlement_reference_hash",
    "settlement_started_at","normal_eligible_at","reserve_amount_cents","reserve_release_at",
    "settlement_policy_version","updated_at"
  ) values (
    v_money."creator_id",v_source_type,v_money."source_id",v_money."amount_minor",v_platform_fee,
    p_provider_fee_minor,0,p_creator_net_minor,v_money."currency",'held',v_normal_eligible_at,
    jsonb_build_object(
      'provider',v_provider."provider",'production_money',true,'provider_verified',true,
      'settlement_verified',true,'payout_ready',false,'settlement_started_from','provider_event.occurred_at',
      'normal_hold',case when v_policy."normal_hold" is null then null else v_policy."normal_hold"::text end,
      'requires_obligation_completion',v_policy."requires_obligation_completion",
      'post_completion_hold',case when v_policy."post_completion_hold" is null then null else v_policy."post_completion_hold"::text end,
      'reserve_basis_points',v_policy."reserve_basis_points",'reserve_duration',v_policy."reserve_duration"::text,
      'source_product_type',v_product."product_type",'original_transaction_bound',true
    ),
    v_provider."id",v_money."id",p_settlement_reference_hash,v_provider."occurred_at",
    v_normal_eligible_at,v_reserve,v_reserve_release_at,v_policy."policy_version",v_now
  ) returning * into v_earning;

  update public."money_access_ledger_events"
  set "metadata"=coalesce("metadata",'{}'::jsonb)||jsonb_build_object(
    'settlement_verified',true,'settlement_reference_hash',p_settlement_reference_hash,
    'creator_earnings_ledger_id',v_earning."id",'creator_net_minor',p_creator_net_minor,
    'provider_fee_minor',p_provider_fee_minor,'platform_fee_minor',v_platform_fee,
    'settlement_started_at',v_provider."occurred_at",'normal_eligible_at',v_normal_eligible_at,
    'reserve_amount_cents',v_reserve,'reserve_release_at',v_reserve_release_at,
    'settlement_policy_version',v_policy."policy_version",
    'payout_readiness_proved',false,'requires_settlement_before_payable',true
  ) where "id"=v_money."id";

  return jsonb_build_object('status','held','earningsLedgerId',v_earning."id",
    'normalEligibleAt',v_normal_eligible_at,'reserveAmountCents',v_reserve,
    'reserveReleaseAt',v_reserve_release_at,'requiresObligationCompletion',v_policy."requires_obligation_completion");
end;
$$;

revoke all on function public."finalize_creator_money_settlement_provider_closeout_internal"(uuid,integer,integer,text,integer)
  from public, anon, authenticated, service_role;

create or replace function public."creator_earnings_withdrawable_cents_internal"(
  p_earnings_ledger_id uuid,
  p_at timestamptz
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_earning public."creator_earnings_ledger"%rowtype;
  v_policy public."creator_money_settlement_policies"%rowtype;
  v_completion timestamptz;
  v_eligible timestamptz;
  v_reserve_release timestamptz;
begin
  select earning.* into v_earning from public."creator_earnings_ledger" earning
  where earning."id"=p_earnings_ledger_id;
  if v_earning."id" is null
    or p_at is null
    or v_earning."settlement_policy_version" is null
    or public."creator_earnings_current_state_internal"(v_earning."id")<>'available'
  then return 0; end if;
  select policy.* into v_policy from public."creator_money_settlement_policies" policy
  where policy."source_type"=v_earning."source_type"
    and policy."policy_version"=v_earning."settlement_policy_version";
  if v_policy."source_type" is null then return 0; end if;
  select receipt."completed_at" into v_completion
  from public."creator_money_obligation_completion_receipts" receipt
  where receipt."earnings_ledger_id"=v_earning."id";
  v_eligible:=case when v_policy."requires_obligation_completion"
    then v_completion+v_policy."post_completion_hold"
    else v_earning."normal_eligible_at" end;
  if v_eligible is null or v_eligible>p_at then return 0; end if;
  v_reserve_release:=coalesce(v_earning."reserve_release_at",v_eligible+v_policy."reserve_duration");
  return greatest(0,v_earning."net_creator_amount_cents"-
    case when v_reserve_release>p_at then coalesce(v_earning."reserve_amount_cents",v_earning."net_creator_amount_cents") else 0 end);
end;
$$;

revoke all on function public."creator_earnings_withdrawable_cents_internal"(uuid,timestamptz)
  from public, anon, authenticated, service_role;

create or replace function public."enforce_creator_payout_allocation_available_internal"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator uuid;
  v_request_creator uuid;
  v_limit integer;
  v_existing bigint;
begin
  perform 1 from public."creator_earnings_ledger"
  where "id"=new."earnings_ledger_id" for share;
  select "creator_id",public."creator_earnings_withdrawable_cents_internal"("id",timezone('utc'::text,now()))
  into v_creator,v_limit from public."creator_earnings_ledger"
  where "id"=new."earnings_ledger_id";
  select "creator_id" into v_request_creator from public."creator_payout_requests"
  where "id"=new."payout_request_id";
  if v_creator is null or v_request_creator is distinct from v_creator
  then raise exception 'payout_allocation_creator_mismatch'; end if;
  select coalesce(sum(allocation."amount_cents"),0) into v_existing
  from public."creator_payout_allocations" allocation
  where allocation."earnings_ledger_id"=new."earnings_ledger_id"
    and allocation."state" in ('reserved','processing','paid')
    and (tg_op='INSERT' or allocation."id"<>old."id");
  if new."state" in ('reserved','processing','paid')
    and v_existing+new."amount_cents">coalesce(v_limit,0)
  then raise exception 'payout_allocation_exceeds_available_after_reserve'; end if;
  return new;
end;
$$;

drop trigger if exists "enforce_creator_payout_allocation_available"
  on public."creator_payout_allocations";
create trigger "enforce_creator_payout_allocation_available"
before insert or update of "earnings_ledger_id","payout_request_id","amount_cents","state"
on public."creator_payout_allocations"
for each row execute function public."enforce_creator_payout_allocation_available_internal"();
revoke all on function public."enforce_creator_payout_allocation_available_internal"()
  from public, anon, authenticated, service_role;

create or replace function public."release_mature_creator_money_settlements"(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz:=timezone('utc'::text,now());
  v_limit integer:=greatest(1,least(500,coalesce(p_limit,100)));
  v_live text; v_payouts text; v_connect text;
  v_row record; v_eligible timestamptz; v_released integer:=0; v_blocked integer:=0;
begin
  select "state" into v_live from public."platform_money_kill_switches" where "key"='live_money_enabled';
  select "state" into v_payouts from public."platform_money_kill_switches" where "key"='payouts_enabled';
  select "state" into v_connect from public."platform_money_kill_switches" where "key"='stripe_connect_enabled';
  if coalesce(v_live,'off')<>'on' or coalesce(v_payouts,'off')<>'on' or coalesce(v_connect,'off')<>'on'
  then return jsonb_build_object('status','blocked','reason','payout_switches_not_enabled','released',0); end if;

  for v_row in
    select earning."id" earnings_id,earning."creator_id",earning."money_ledger_event_id" money_id,
      earning."normal_eligible_at",policy."requires_obligation_completion",policy."post_completion_hold",
      completion."completed_at"
    from public."creator_earnings_ledger" earning
    join public."creator_money_settlement_policies" policy
      on policy."source_type"=earning."source_type" and policy."policy_version"=earning."settlement_policy_version"
    join public."money_access_ledger_events" money on money."id"=earning."money_ledger_event_id"
    join public."provider_events" provider_event on provider_event."id"=earning."provider_event_id"
    left join public."creator_money_obligation_completion_receipts" completion
      on completion."earnings_ledger_id"=earning."id"
    where public."creator_earnings_current_state_internal"(earning."id")='held'
      and money."environment"='production' and money."status"='verified'
      and money."payable_state"='pending_verification'
      and provider_event."provider" in ('revenuecat_app_store','revenuecat_google_play')
      and provider_event."status"='processed'
      and not public."revenuecat_authority_quarantined_internal"(
        provider_event."provider",provider_event."user_id",provider_event."environment")
    order by earning."created_at",earning."id" limit v_limit
    for update of earning,money skip locked
  loop
    v_eligible:=case when v_row."requires_obligation_completion"
      then v_row."completed_at"+v_row."post_completion_hold" else v_row."normal_eligible_at" end;
    if v_eligible is null or v_eligible>v_now then
      v_blocked:=v_blocked+1;
      continue;
    end if;
    if public."is_account_access_restricted"(v_row."creator_id"::text)
      or not public."wave1_user_has_active_legal_requirements_internal"(v_row."creator_id",'creator_money')
      or not exists (
        select 1 from public."wave1_creator_eligibility" eligibility
        where eligibility."creator_user_id"=v_row."creator_id"
          and eligibility."state"='VERIFIED' and eligibility."account_status"='ACTIVE'
          and eligibility."age_18_plus" and eligibility."legal_accepted" and eligibility."creator_role"
          and eligibility."moderation_state"='CLEAR' and eligibility."market"='UNITED_STATES'
          and eligibility."rollout_eligible" and eligibility."platform_capability"
          and eligibility."provider_eligible" and eligibility."kyc_complete" and eligibility."tax_complete"
          and eligibility."sanctions_clear" and eligibility."payout_eligible"
      )
    then v_blocked:=v_blocked+1; continue; end if;
    perform public."record_creator_earnings_lifecycle_internal"(
      v_row."earnings_id",'available','settlement_released',
      'settlement-release:'||v_row."earnings_id"::text,null,v_row."money_id",
      jsonb_build_object('released_at',v_now,'normal_eligible_at',v_eligible,'reserve_still_applies',true)
    );
    update public."money_access_ledger_events" set "payable_state"='payable',
      "metadata"=coalesce("metadata",'{}'::jsonb)||jsonb_build_object(
        'payout_readiness_proved',true,'released_to_available_at',v_now,
        'normal_eligible_at',v_eligible,'reserve_still_applies',true
      ) where "id"=v_row."money_id" and "payable_state"='pending_verification';
    v_released:=v_released+1;
  end loop;
  return jsonb_build_object('status','complete','released',v_released,'blocked',v_blocked);
end;
$$;

revoke all on function public."release_mature_creator_money_settlements"(integer)
  from public, anon, authenticated;
grant execute on function public."release_mature_creator_money_settlements"(integer) to service_role;

create or replace function public."calculate_creator_payout_balances"(p_creator_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid:=auth.uid(); v_creator uuid:=coalesce(p_creator_id,auth.uid());
  v_now timestamptz:=timezone('utc'::text,now());
  v_pending bigint:=0; v_held bigint:=0; v_reserved bigint:=0; v_available bigint:=0;
  v_paid bigint:=0; v_reversed bigint:=0; v_negative bigint:=0; v_non_usd boolean:=false;
begin
  if v_actor is null then raise exception 'monetization_auth_required'; end if;
  if not public."wave1_current_caller_authority_internal"()
    or public."is_account_access_restricted"(v_actor::text)
  then raise exception 'monetization_session_authority_required'; end if;
  if v_creator<>v_actor and not public."has_platform_role"(array['owner'::text,'operator'::text])
  then raise exception 'monetization_permission_denied'; end if;
  if public."revenuecat_authority_quarantined_internal"(null,null,null) then
    return jsonb_build_object('creatorId',v_creator,'currency','usd','pendingCents',0,'heldCents',0,
      'reservedCents',0,'availableCents',0,'paidCents',0,'reversedCents',0,
      'negativeAdjustmentCents',0,'payoutBlockedByNegativeAdjustment',true,
      'nonUsdObligationsPresent',false,'authorityQuarantined',true);
  end if;

  select
    coalesce(sum(earning."net_creator_amount_cents") filter (
      where public."creator_earnings_current_state_internal"(earning."id")='pending'),0),
    coalesce(sum(earning."net_creator_amount_cents") filter (
      where public."creator_earnings_current_state_internal"(earning."id")='held'),0),
    coalesce(sum(greatest(0,earning."net_creator_amount_cents"-
      public."creator_earnings_withdrawable_cents_internal"(earning."id",v_now))) filter (
      where public."creator_earnings_current_state_internal"(earning."id")='available'),0),
    coalesce(sum(greatest(0,public."creator_earnings_withdrawable_cents_internal"(earning."id",v_now)
      -coalesce(allocated."amount_cents",0))) filter (
      where public."creator_earnings_current_state_internal"(earning."id")='available'),0),
    coalesce(sum(coalesce(allocated."paid_amount_cents",0)),0),
    coalesce(sum(earning."net_creator_amount_cents") filter (
      where public."creator_earnings_current_state_internal"(earning."id")='reversed'),0)
  into v_pending,v_held,v_reserved,v_available,v_paid,v_reversed
  from public."creator_earnings_ledger" earning
  left join (
    select allocation."earnings_ledger_id",sum(allocation."amount_cents") amount_cents,
      coalesce(sum(allocation."amount_cents") filter(where allocation."state"='paid'),0) paid_amount_cents
    from public."creator_payout_allocations" allocation
    where allocation."state" in ('reserved','processing','paid')
    group by allocation."earnings_ledger_id"
  ) allocated on allocated."earnings_ledger_id"=earning."id"
  where earning."creator_id"=v_creator and earning."currency"='usd';

  select coalesce(sum(obligation."amount_cents"),0) into v_negative
  from public."creator_money_recovery_obligations" obligation
  where obligation."creator_id"=v_creator and obligation."state"='pending_recovery';
  select exists(select 1 from public."creator_earnings_ledger" earning
    where earning."creator_id"=v_creator and earning."currency"<>'usd') into v_non_usd;
  return jsonb_build_object(
    'creatorId',v_creator,'currency','usd','pendingCents',v_pending,'heldCents',v_held,
    'reservedCents',v_reserved,'availableCents',greatest(v_available,0),'paidCents',v_paid,
    'reversedCents',v_reversed,'negativeAdjustmentCents',v_negative,
    'payoutBlockedByNegativeAdjustment',v_negative>0,'nonUsdObligationsPresent',v_non_usd
  );
end;
$$;

revoke all on function public."calculate_creator_payout_balances"(uuid) from public, anon;
grant execute on function public."calculate_creator_payout_balances"(uuid) to authenticated, service_role;

comment on function public."calculate_creator_payout_balances"(uuid) is
  'Server-authoritative Pending/Held/Reserved/Available/Paid/Reversed readback. Available excludes reserve and active allocations; pending recovery is exposed as a negative adjustment and blocks payout.';

comment on function public."release_mature_creator_money_settlements"(integer) is
  'Releases ordinary earnings only after provider occurred_at + 7 days, and event/Watch-Party earnings only after an immutable completion receipt + 48 hours. Reserve remains unavailable.';

comment on function public."finalize_creator_money_settlement_provider_closeout_internal"(uuid,integer,integer,text,integer) is
  'Creates immutable held creator earnings from exact provider receipt economics. Timing derives only from provider occurred_at and server-owned policy; caller hold days are rejected.';

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
security definer
set search_path = ''
as $$
declare
  v_key text := coalesce(nullif(pg_catalog.btrim(policy_key),''),'payout_readiness');
  v_obligation text := coalesce(nullif(pg_catalog.btrim(creator_obligation_state),''),'pending');
begin
  if v_key in ('premium_subscription','payout_readiness') then
    return jsonb_build_object(
      'payoutHoldState','not_applicable','creatorPayoutHoldRequired',false,
      'canReleasePayoutNow',false,'reasonCodes',array['no_creator_payout_hold_needed']
    );
  end if;
  return jsonb_build_object(
    'payoutHoldState',case when v_obligation in ('failed','review_required') then 'blocked' else 'held' end,
    'creatorPayoutHoldRequired',true,'canReleasePayoutNow',false,
    'reasonCodes',case when v_obligation in ('failed','review_required')
      then array['creator_obligation_not_cleared']
      else array['server_authoritative_settlement_required','client_flags_cannot_release_payout'] end,
    'creatorFacingExplanation','Pending is not Available. Only database-owned settlement, completion, reserve, reversal, and payout-readiness authority can release funds.',
    'adminFacingExplanation','Caller booleans are compatibility inputs only and never authorize financial release.'
  );
end;
$$;
