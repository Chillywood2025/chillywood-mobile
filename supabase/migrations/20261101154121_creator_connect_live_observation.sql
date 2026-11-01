begin;
-- Read-only provider observation is not payout, tax, store-route or fee qualification.
-- No policy rows or creator accounts are seeded, no financial rails are changed.
create table private.creator_connect_live_observation_policy (
  singleton boolean primary key default true check(singleton),
  platform_account_id text not null check(platform_account_id ~ '^acct_[A-Za-z0-9]+$'),
  enabled boolean not null default false
);
alter table private.creator_connect_live_observation_policy enable row level security;
alter table private.creator_connect_live_observation_policy force row level security;
revoke all on private.creator_connect_live_observation_policy from public,anon,authenticated,service_role;
alter table public.creator_payout_accounts add column provider_live_observation jsonb;
create function private.creator_connect_live_proof_matches(p jsonb,a text) returns boolean
language sql immutable set search_path='' as $$ select coalesce(
  jsonb_typeof(p)='object' and p->>'accountId'=a and p->>'environment'='live'
  and p->>'platformAccountId' ~ '^acct_[A-Za-z0-9]+$' and p->>'platformAccountId'<>a
  and p->'modeVerified'='true'::jsonb and p->>'v2Dashboard'='express'
  and p->>'v2FeesCollector'='application' and p->>'v2LossesCollector'='application'
  and p->>'source'='authenticated_stripe_get_v1_v2',false) $$;
revoke all on function private.creator_connect_live_proof_matches(jsonb,text) from public,anon,authenticated;
grant execute on function private.creator_connect_live_proof_matches(jsonb,text) to service_role;
alter table public.creator_payout_accounts drop constraint creator_payout_accounts_configuration_observation_check, add constraint creator_payout_accounts_configuration_observation_check check (
    provider_configuration_status in ('match','mismatch','unknown')
    and (provider_configuration_observed_at is not null or provider_configuration_status='unknown')
    and (provider_configuration_observed_at is null or provider_fees_payer = case
      when provider_fees_payer_raw in ('application','application_express','application_custom') then 'platform'
      when provider_fees_payer_raw='account' then 'account'
      else 'unknown' end)
    and (provider_configuration_status <> 'match' or (
      provider='stripe_connect' and (
        (provider_environment='test' and provider_expected_configuration_key='stripe_connect_test_express_controller_v1')
        or (provider_environment='live' and provider_expected_configuration_key='stripe_connect_live_express_recipient_controller_v1'
          and private.creator_connect_live_proof_matches(provider_live_observation,provider_account_id))
      )
      and nullif(btrim(provider_account_id),'') is not null
      and provider_configuration_account_id=provider_account_id
      and provider_account_type in ('express','none')
      and provider_controller_type='application' and provider_is_controller is true
      and provider_dashboard_type='express'
      and provider_fees_payer='platform' and provider_fees_payer_raw in ('application','application_express')
      and provider_losses_collector='platform' and provider_requirements_collection='stripe'
    ) is true)
  );

create or replace function private.project_creator_connect_observed_eligibility()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $function$
declare
  v_observed boolean := new.provider='stripe_connect' and new.provider_environment in ('test','live')
    and nullif(btrim(new.provider_account_id),'') is not null and new.provider_configuration_observed_at is not null
    and new.provider_configuration_account_id=new.provider_account_id;
  v_account text := 'unknown'; v_controller text := 'unknown'; v_is_controller boolean;
  v_dashboard text := 'unknown'; v_fees text := 'unknown'; v_fees_raw text := 'unknown';
  v_losses text := 'unknown'; v_requirements text := 'unknown'; v_status text := 'unknown';
  v_reported_ready boolean; v_kyc_ready boolean; v_ready boolean; v_onboarding text; v_reason text; v_configuration jsonb;
begin
  if new.provider<>'stripe_connect' or new.provider_environment not in ('test','live') then
    if tg_op='INSERT' then return new; end if;
    if old.provider<>'stripe_connect' or old.provider_environment not in ('test','live') then return new; end if;
  end if;
  -- The account row is the authority. Never copy a provider_ready/configuration
  -- claim from incoming metadata, or let a second Edge write restore old state.
  if v_observed then
    v_account := case when new.provider_account_type in ('express','standard','custom','none') then new.provider_account_type else 'unknown' end;
    v_controller := new.provider_controller_type; v_is_controller := new.provider_is_controller;
    v_dashboard := case when new.provider_dashboard_type in ('express','full','none') then new.provider_dashboard_type else 'unknown' end;
    v_fees := case when new.provider_fees_payer in ('platform','account') then new.provider_fees_payer else 'unknown' end;
    v_fees_raw := new.provider_fees_payer_raw;
    v_losses := case when new.provider_losses_collector in ('platform','stripe') then new.provider_losses_collector else 'unknown' end;
    v_requirements := case when new.provider_requirements_collection in ('platform','stripe') then new.provider_requirements_collection else 'unknown' end;
    if v_is_controller is false
      or v_account not in ('express','none','unknown') or v_controller not in ('application','unknown')
      or v_dashboard not in ('express','unknown') or v_fees not in ('platform','unknown')
      or v_fees_raw not in ('application','application_express','unknown')
      or v_losses not in ('platform','unknown') or v_requirements not in ('stripe','unknown') then v_status := 'mismatch';
    elsif v_is_controller is true and v_account in ('express','none') and v_controller='application'
      and v_dashboard='express' and v_fees='platform' and v_fees_raw in ('application','application_express')
      and v_losses='platform' and v_requirements='stripe' then v_status := 'match';
    end if;
  end if;
  if new.provider_environment='live' and not private.creator_connect_live_proof_matches(new.provider_live_observation,new.provider_account_id) then v_status := 'unknown'; end if;
  v_configuration := jsonb_build_object('status',v_status,
    'expected',jsonb_build_object('key',case when new.provider_environment='live' then 'stripe_connect_live_express_recipient_controller_v1' else 'stripe_connect_test_express_controller_v1' end,'accountTypes',jsonb_build_array('express','none'),
      'controllerType','application','isController',true,'dashboardType','express','feesPayer','platform',
      'feesPayerRaw',jsonb_build_array('application','application_express'),'lossesCollector','platform','requirementsCollection','stripe'),
    'liveProof',new.provider_live_observation,
    'observed',jsonb_build_object('account_type',v_account,'controller_type',v_controller,'is_controller',v_is_controller,
      'dashboard_type',v_dashboard,'fees_payer',v_fees,'fees_payer_raw',v_fees_raw,'losses_collector',v_losses,'requirements_collection',v_requirements));
  v_kyc_ready := new.details_submitted and nullif(btrim(new.disabled_reason),'') is null
    and new.requirements_currently_due='[]'::jsonb and new.requirements_past_due='[]'::jsonb;
  v_kyc_ready := v_kyc_ready and (new.provider_environment='test' or (new.provider_live_observation->'pendingVerification'='[]'::jsonb and new.provider_live_observation->>'requirementsComplete'='true'));
  v_reported_ready := v_kyc_ready and new.payouts_enabled and (new.provider_environment='test' or (new.provider_live_observation->>'recipientTransfers'='active' and new.provider_live_observation->>'payoutSchedule'='manual' and new.country='US' and new.default_currency='usd'));
  v_ready := v_reported_ready and v_status='match';
  v_onboarding := case when nullif(btrim(new.disabled_reason),'') is not null then 'payouts_disabled'
    when v_status<>'match' then 'under_review'
    when new.requirements_currently_due<>'[]'::jsonb or new.requirements_past_due<>'[]'::jsonb then 'action_required'
    when v_ready then 'ready_for_payouts' when new.details_submitted then 'under_review' else 'setup_required' end;
  v_reason := case when v_status='mismatch' then 'The provider account configuration differs from the expected setup and needs platform review. Payouts remain inactive.'
    when v_status='unknown' then 'Provider account configuration is not fully verified. Refresh provider status before continuing setup. Payouts remain inactive.'
    when v_ready then 'Stripe Connect provider readiness is synced. Payout execution is not active.'
    else 'Stripe Connect setup is not complete. Payout execution is not active.' end;
  insert into public.creator_payout_eligibility_records as existing
    (creator_user_id,payout_account_id,eligible_for_payouts,eligibility_status,eligibility_reason,
     kyc_ready,provider_ready,payout_account_ready,last_evaluated_at,platform_admin_audit_log_id,metadata)
  values (new.creator_user_id,new.id,false,v_onboarding,v_reason,v_kyc_ready,v_ready,v_ready,now(),new.last_platform_admin_audit_log_id,
    jsonb_build_object('provider_configuration',v_configuration,'provider_reported_ready',v_reported_ready,'provider_ready',v_ready,
      'provider_status_only',true,'no_payable_balance',true,'live_money_action',false,'payout_execution',false,'provider_environment',new.provider_environment))
  on conflict (creator_user_id) do update set
    payout_account_id=excluded.payout_account_id, eligible_for_payouts=false,
    eligibility_status=case when existing.fraud_hold_active or existing.admin_review_status in ('rejected','on_hold') or existing.eligibility_status='on_hold' then 'on_hold'
      when existing.admin_review_status='pending_review' then 'under_review' else excluded.eligibility_status end,
    eligibility_reason=case when existing.fraud_hold_active or existing.admin_review_status in ('pending_review','rejected','on_hold') or existing.eligibility_status='on_hold'
      then coalesce(existing.eligibility_reason,'Platform review is pending. Payouts remain inactive.') else excluded.eligibility_reason end,
    kyc_ready=excluded.kyc_ready,
    provider_ready=excluded.provider_ready and not (existing.fraud_hold_active or existing.admin_review_status in ('pending_review','rejected','on_hold') or existing.eligibility_status='on_hold'),
    payout_account_ready=excluded.payout_account_ready and not (existing.fraud_hold_active or existing.admin_review_status in ('pending_review','rejected','on_hold') or existing.eligibility_status='on_hold'),
    last_evaluated_at=excluded.last_evaluated_at, platform_admin_audit_log_id=excluded.platform_admin_audit_log_id,
    metadata=existing.metadata || excluded.metadata, updated_at=now();
  return new;
end;
$function$;
revoke all on function private.project_creator_connect_observed_eligibility() from public,anon,authenticated,service_role;

drop trigger creator_connect_observed_eligibility on public.creator_payout_accounts;
create trigger creator_connect_observed_eligibility
after insert or update of provider,provider_environment,provider_account_id,provider_account_type,
  provider_controller_type,provider_is_controller,provider_dashboard_type,provider_fees_payer,provider_fees_payer_raw,
  provider_losses_collector,provider_requirements_collection,provider_configuration_observed_at,provider_configuration_status,
  provider_configuration_account_id,provider_live_observation,country,default_currency,
  details_submitted,payouts_enabled,disabled_reason,requirements_currently_due,requirements_past_due
on public.creator_payout_accounts for each row execute function private.project_creator_connect_observed_eligibility();


-- Context and compare-and-set recorder accept only the existing server binding.
create function public.get_creator_connect_live_observation_context(p_creator uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.creator_payout_accounts; p private.creator_connect_live_observation_policy;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
  select * into p from private.creator_connect_live_observation_policy where enabled;
  if p.platform_account_id is null then raise exception 'live_observation_not_configured'; end if;
  select * into a from public.creator_payout_accounts where creator_user_id=p_creator::text and provider='stripe_connect' and provider_environment='live';
  if a.id is null or a.provider_account_id !~ '^acct_[A-Za-z0-9]+$' or a.provider_account_id=p.platform_account_id then raise exception 'live_account_binding_required'; end if;
  return jsonb_build_object('rowId',a.id,'creatorId',p_creator,'accountId',a.provider_account_id,'platformAccountId',p.platform_account_id,
    'previousObservedAt',a.provider_configuration_observed_at,'environment','live');
end $$;
create function public.record_creator_connect_live_observation(p_context jsonb,p_facts jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.creator_payout_accounts; p private.creator_connect_live_observation_policy;
  proof jsonb:=p_facts->'proof'; observed timestamptz:=clock_timestamp(); v_status text:=p_facts->>'configurationStatus'; ready boolean;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
  select * into p from private.creator_connect_live_observation_policy where enabled for share;
  if p.platform_account_id is null or p_context->>'platformAccountId' is distinct from p.platform_account_id
    or p_context->>'environment' is distinct from 'live'
    or p_facts->>'accountId' is distinct from p_context->>'accountId'
    or proof->>'platformAccountId' is distinct from p.platform_account_id
    or proof->>'accountId' is distinct from p_context->>'accountId'
    or proof->'modeVerified' is distinct from 'true'::jsonb or proof->>'environment' is distinct from 'live'
    or proof->>'source' is distinct from 'authenticated_stripe_get_v1_v2'
    or v_status is null or v_status not in ('match','mismatch','unknown')
    or (p_facts->>'readStartedAt')::timestamptz is null
    or (p_facts->>'readStartedAt')::timestamptz not between observed-interval '60 seconds' and observed
    or jsonb_typeof(p_facts->'currentlyDue') is distinct from 'array'
    or jsonb_typeof(p_facts->'pastDue') is distinct from 'array'
    or jsonb_typeof(p_facts->'eventuallyDue') is distinct from 'array'
    or jsonb_typeof(proof->'pendingVerification') is distinct from 'array'
  then raise exception 'live_observation_binding_invalid'; end if;
  select * into a from public.creator_payout_accounts where id=(p_context->>'rowId')::uuid for update;
  if a.id is null or a.creator_user_id is distinct from p_context->>'creatorId' or a.provider<>'stripe_connect'
    or a.provider_environment<>'live' or a.provider_account_id is distinct from p_context->>'accountId'
    or a.provider_configuration_observed_at is distinct from (p_context->>'previousObservedAt')::timestamptz
    then return jsonb_build_object('recorded',false,'stale',true); end if;
  ready:=v_status='match' and p_facts->'detailsSubmitted'='true'::jsonb and p_facts->'payoutsEnabled'='true'::jsonb
    and nullif(p_facts->>'disabledReason','') is null and p_facts->'currentlyDue'='[]'::jsonb and p_facts->'pastDue'='[]'::jsonb
    and proof->'pendingVerification'='[]'::jsonb and proof->'requirementsComplete'='true'::jsonb
    and proof->>'recipientTransfers'='active' and proof->>'payoutSchedule'='manual' and p_facts->>'country'='US' and p_facts->>'currency'='usd';
  update public.creator_payout_accounts set
    provider_live_observation=proof,provider_configuration_observed_at=observed,provider_configuration_account_id=a.provider_account_id,
    provider_expected_configuration_key='stripe_connect_live_express_recipient_controller_v1',provider_configuration_status=v_status,
    provider_configuration_key=case when v_status='match' then 'stripe_connect_live_express_recipient_controller_v1' end,
    provider_account_type=p_facts->>'accountType',provider_controller_type=p_facts->>'controllerType',provider_is_controller=(p_facts->>'isController')::boolean,
    provider_dashboard_type=p_facts->>'dashboardType',provider_fees_payer=p_facts->>'feesPayer',provider_fees_payer_raw=p_facts->>'feesPayerRaw',
    provider_losses_collector=p_facts->>'lossesCollector',provider_requirements_collection=p_facts->>'requirementsCollection',
    charges_enabled=coalesce((p_facts->>'chargesEnabled')::boolean,false),payouts_enabled=coalesce((p_facts->>'payoutsEnabled')::boolean,false),
    details_submitted=coalesce((p_facts->>'detailsSubmitted')::boolean,false),disabled_reason=p_facts->>'disabledReason',
    country=p_facts->>'country',default_currency=p_facts->>'currency',requirements_currently_due=p_facts->'currentlyDue',
    requirements_past_due=p_facts->'pastDue',requirements_eventually_due=p_facts->'eventuallyDue',
    transfers_capability_status=case when proof->>'recipientTransfers' in ('active','inactive','pending') then proof->>'recipientTransfers' else 'unknown' end,
    onboarding_status=case when ready then 'ready_for_payouts' else 'under_review' end,
    last_provider_sync_at=observed,updated_at=observed
  where id=a.id;
  return jsonb_build_object('recorded',true,'stale',false,'financialAuthority',false,'payoutExecution',false);
end $$;
revoke all on function public.get_creator_connect_live_observation_context(uuid),public.record_creator_connect_live_observation(jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_creator_connect_live_observation_context(uuid),public.record_creator_connect_live_observation(jsonb,jsonb) to service_role;

-- Independently qualified routes still require a fresh provider observation.
do $guard$
declare definition text;
begin
  select pg_get_functiondef('private.resolve_creator_external_payment_capability(uuid,uuid,text,uuid,integer,text,text,uuid)'::regprocedure) into definition;
  if position('recipient.provider_configuration_observed_at<=clock_timestamp()' in definition)=0 then
    raise exception 'external_capability_observation_guard_missing'; end if;
  definition:=replace(definition,'recipient.provider_configuration_observed_at<=clock_timestamp()',
    'recipient.provider_configuration_observed_at<=clock_timestamp() and recipient.provider_configuration_observed_at>clock_timestamp()-interval ''15 minutes''');
  execute definition;
end $guard$;

commit;
