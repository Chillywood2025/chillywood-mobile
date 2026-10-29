begin;

-- Expected onboarding policy is not a provider observation. Existing rows keep
-- an unknown observation marker until an actual account response is recorded.
alter table public.creator_payout_accounts
  add column provider_controller_type text not null default 'unknown',
  add column provider_is_controller boolean,
  add column provider_fees_payer_raw text not null default 'unknown',
  add column provider_configuration_observed_at timestamptz,
  add column provider_configuration_account_id text,
  add column provider_configuration_status text not null default 'unknown',
  add column provider_expected_configuration_key text;

alter table public.creator_payout_accounts
  drop constraint creator_payout_accounts_provider_account_type_check,
  add constraint creator_payout_accounts_provider_account_type_check check (
    provider_account_type in ('not_configured','express','standard','custom','none','accounts_v2_recipient','unknown')
  ),
  drop constraint creator_payout_accounts_provider_controller_check,
  add constraint creator_payout_accounts_provider_controller_check check (
    provider_requirements_collection in ('not_configured','stripe','platform','unknown')
    and provider_losses_collector in ('not_configured','stripe','platform','unknown')
    and provider_fees_payer in ('not_configured','stripe','platform','account','unknown')
    and provider_controller_type in ('application','account','unknown')
    and provider_fees_payer_raw in ('application','application_express','application_custom','account','unknown')
  ),
  add constraint creator_payout_accounts_configuration_observation_check check (
    provider_configuration_status in ('match','mismatch','unknown')
    and (provider_configuration_observed_at is not null or provider_configuration_status='unknown')
    and (provider_configuration_observed_at is null or provider_fees_payer = case
      when provider_fees_payer_raw in ('application','application_express','application_custom') then 'platform'
      when provider_fees_payer_raw='account' then 'account'
      else 'unknown' end)
    and (provider_configuration_status <> 'match' or (
      provider_expected_configuration_key='stripe_connect_test_express_controller_v1'
      and provider='stripe_connect' and provider_environment='test'
      and nullif(btrim(provider_account_id),'') is not null
      and provider_configuration_account_id=provider_account_id
      and provider_account_type in ('express','none')
      and provider_controller_type='application' and provider_is_controller is true
      and provider_dashboard_type='express'
      and provider_fees_payer='platform' and provider_fees_payer_raw in ('application','application_express')
      and provider_losses_collector='platform' and provider_requirements_collection='stripe'
    ) is true)
  );

comment on column public.creator_payout_accounts.provider_configuration_observed_at is
  'Recorded account observation time; null means legacy configuration fields are not verified provider state.';
comment on column public.creator_payout_accounts.provider_expected_configuration_key is
  'Expected application onboarding policy, separate from observed controller and account fields.';

create or replace function private.project_creator_connect_observed_eligibility()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $function$
declare
  v_observed boolean := new.provider='stripe_connect' and new.provider_environment='test'
    and nullif(btrim(new.provider_account_id),'') is not null and new.provider_configuration_observed_at is not null
    and new.provider_configuration_account_id=new.provider_account_id;
  v_account text := 'unknown'; v_controller text := 'unknown'; v_is_controller boolean;
  v_dashboard text := 'unknown'; v_fees text := 'unknown'; v_fees_raw text := 'unknown';
  v_losses text := 'unknown'; v_requirements text := 'unknown'; v_status text := 'unknown';
  v_reported_ready boolean; v_kyc_ready boolean; v_ready boolean; v_onboarding text; v_reason text; v_configuration jsonb;
begin
  if new.provider<>'stripe_connect' or new.provider_environment<>'test' then
    if tg_op='INSERT' then return new; end if;
    if old.provider<>'stripe_connect' or old.provider_environment<>'test' then return new; end if;
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
  v_configuration := jsonb_build_object('status',v_status,
    'expected',jsonb_build_object('key','stripe_connect_test_express_controller_v1','accountTypes',jsonb_build_array('express','none'),
      'controllerType','application','isController',true,'dashboardType','express','feesPayer','platform',
      'feesPayerRaw',jsonb_build_array('application','application_express'),'lossesCollector','platform','requirementsCollection','stripe'),
    'observed',jsonb_build_object('account_type',v_account,'controller_type',v_controller,'is_controller',v_is_controller,
      'dashboard_type',v_dashboard,'fees_payer',v_fees,'fees_payer_raw',v_fees_raw,'losses_collector',v_losses,'requirements_collection',v_requirements));
  v_kyc_ready := new.details_submitted and nullif(btrim(new.disabled_reason),'') is null
    and new.requirements_currently_due='[]'::jsonb and new.requirements_past_due='[]'::jsonb;
  v_reported_ready := v_kyc_ready and new.payouts_enabled;
  v_ready := v_reported_ready and v_status='match';
  v_onboarding := case when nullif(btrim(new.disabled_reason),'') is not null then 'payouts_disabled'
    when v_status<>'match' then 'under_review'
    when new.requirements_currently_due<>'[]'::jsonb or new.requirements_past_due<>'[]'::jsonb then 'action_required'
    when v_ready then 'ready_for_payouts' when new.details_submitted then 'under_review' else 'setup_required' end;
  v_reason := case when v_status='mismatch' then 'The provider account configuration differs from the expected setup and needs platform review. Payouts remain inactive.'
    when v_status='unknown' then 'Provider account configuration is not fully verified. Refresh provider status before continuing setup. Payouts remain inactive.'
    when v_ready then 'Stripe Connect test-mode provider readiness is synced. Payout execution is not active.'
    else 'Stripe Connect test-mode setup is not complete. Payout execution is not active.' end;
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

create trigger creator_connect_observed_eligibility
after insert or update of provider,provider_environment,provider_account_id,provider_account_type,
  provider_controller_type,provider_is_controller,provider_dashboard_type,provider_fees_payer,provider_fees_payer_raw,
  provider_losses_collector,provider_requirements_collection,provider_configuration_observed_at,provider_configuration_status,
  provider_configuration_account_id,
  details_submitted,payouts_enabled,disabled_reason,requirements_currently_due,requirements_past_due
on public.creator_payout_accounts for each row execute function private.project_creator_connect_observed_eligibility();

-- Previously hardcoded rows are not observations. Clear the derived readiness
-- atomically while retaining all recorded provider facts and platform holds.
update public.creator_payout_accounts set provider_configuration_status=provider_configuration_status
where provider='stripe_connect' and provider_configuration_observed_at is null;

commit;
