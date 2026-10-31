-- Owner-approved app fee: instant cashouts 2%, scheduled 0%, tips 0%.
-- Forward only: existing request amounts/fees remain untouched. No provider call,
-- money switch, 20% sales-share or provider-fee assumption changes.
alter table public.monetization_system_settings
  drop constraint monetization_system_settings_cashout_check;
alter table public.monetization_system_settings alter column instant_cashout_fee_bps set default 200;
update public.monetization_system_settings set instant_cashout_fee_bps=200;
alter table public.monetization_system_settings add constraint monetization_system_settings_cashout_check
  check(scheduled_payout_fee_bps=0 and instant_cashout_fee_bps=200 and instant_cashout_fee_cap_cents is null);

create or replace function public.calculate_creator_instant_cashout_fee(p_amount_cents integer)
returns integer language sql immutable set search_path='' as $$
 select ((greatest(coalesce(p_amount_cents,0),0)::bigint*200+9999)/10000)::integer;
$$;
revoke all on function public.calculate_creator_instant_cashout_fee(integer) from public;
grant execute on function public.calculate_creator_instant_cashout_fee(integer) to authenticated,service_role;

-- New informational quotes do not reserve balance or authorize payment.
create function public.preview_creator_cashout_fees(p_amount_cents integer,p_payout_type text)
returns jsonb language plpgsql immutable set search_path='' as $$
declare fee integer;
begin
 if p_amount_cents is null or p_amount_cents<=0 or p_payout_type is null or p_payout_type not in('scheduled','instant') then
   raise exception 'cashout_fee_quote_input_invalid'; end if;
 fee:=case when p_payout_type='instant' then public.calculate_creator_instant_cashout_fee(p_amount_cents) else 0 end;
 return jsonb_build_object('amountCents',p_amount_cents,'currency','usd','payoutType',p_payout_type,
 'appFeeBps',case when p_payout_type='instant' then 200 else 0 end,'appFeeCents',fee,
 'providerFeeCents',null,'providerFeeStatus','unknown','netAfterAppFeeCents',p_amount_cents-fee,
 'netAfterAllFeesCents',null,'financialAuthority',false,'providerMutationPerformed',false);
end;
$$;
revoke all on function public.preview_creator_cashout_fees(integer,text) from public,anon;
grant execute on function public.preview_creator_cashout_fees(integer,text) to authenticated,service_role;

-- Fee-bearing accepted request identity is immutable, including pre-migration
-- 1.5% requests. Reconciliation may change status, never retrospectively reprice.
create function public.preserve_creator_payout_fee_terms() returns trigger language plpgsql set search_path='' as $$
begin
 if row(new.creator_id,new.amount_cents,new.currency,new.payout_type,new.instant_fee_cents)
   is distinct from row(old.creator_id,old.amount_cents,old.currency,old.payout_type,old.instant_fee_cents) then
   raise exception 'accepted_payout_fee_terms_immutable'; end if;
 return new;
end;
$$;
revoke all on function public.preserve_creator_payout_fee_terms() from public,anon,authenticated,service_role;
create trigger preserve_creator_payout_fee_terms before update on public.creator_payout_requests
 for each row execute function public.preserve_creator_payout_fee_terms();

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

  v_fee := case when v_type = 'instant' then public.calculate_creator_instant_cashout_fee(p_amount_cents) else 0 end;
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
    'appFeeCents',v_request."instant_fee_cents",'providerFeeCents',null,
    'providerFeeStatus','unknown','netAfterAppFeeCents',v_request."amount_cents"-v_request."instant_fee_cents",
    'netAfterAllFeesCents',null,'providerMutationPerformed',false
  );
end;
$$;
revoke all on function public."create_creator_payout_request_safe"(integer,text) from public, anon;
grant execute on function public."create_creator_payout_request_safe"(integer,text) to authenticated, service_role;
