-- Disposable pgTAP transactions ONLY. These functions live in pg_temp, are
-- invoker-only, and are never installed by migrations. Synthetic events and
-- independent test facts are NOT provider verification or production evidence.
create function pg_temp.seed_creator_premium(p_creator uuid,p_epoch text default 'initial') returns void
language plpgsql set search_path='' as $$
declare result jsonb; old_claims text:=current_setting('request.jwt.claims',true);
 old_role text:=current_setting('request.jwt.claim.role',true);
begin
 if current_user<>'postgres' then raise exception 'test_fixture_postgres_only'; end if;
 if not exists(select 1 from auth.users where id=p_creator and email_confirmed_at is not null)
 then raise exception 'test_fixture_verified_creator_required'; end if;
 perform set_config('request.jwt.claims','{}',true);
 perform set_config('request.jwt.claim.role','',true);
 update public.platform_money_kill_switches set state='sandbox_only'
 where key in ('revenuecat_google_play_enabled','provider_webhooks_enabled');
 select public.process_revenuecat_premium_event_atomic(
  'revenuecat_google_play','pgtap-creator-premium:'||p_creator||':'||p_epoch,'INITIAL_PURCHASE',p_creator,
  p.provider_product_id,p.provider_base_plan_id,'sandbox','active',now()-interval '1 minute',
  now()+interval '1 day',now(),999,'usd',repeat('a',64),'NORMAL','google_play','android',null,p.id,
  'pgtap-creator-original:'||p_creator||':'||p_epoch) into result
 from public.monetization_products p where p.provider='revenuecat_google_play'
  and p.environment='sandbox' and p.product_type='premium_subscription' and p.status='sandbox'
 order by p.created_at,p.id limit 1;
 if result->>'status' is distinct from 'processed' then
  raise exception 'test_fixture_canonical_premium_failed: %',result; end if;
 if private.ordinary_commerce_premium_current(p_creator,'sandbox') is not true then
  raise exception 'test_fixture_finite_premium_required'; end if;
 perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 perform set_config('request.jwt.claim.role',coalesce(old_role,''),true);
end $$;
revoke all on function pg_temp.seed_creator_premium(uuid,text) from public,anon,authenticated,service_role;

-- Only legacy strict-financial-authority tests should call this. All supplied
-- tax, KYC, sanctions and provider facts are explicitly synthetic local inputs.
-- Sandbox tool tests instead call the real declaration RPC below and keep
-- independent compliance unknown/PENDING_VERIFICATION.
create function pg_temp.seed_synthetic_creator_provider(p_creator uuid) returns void
language plpgsql set search_path='' as $$
declare account text:='acct_test'||replace(p_creator::text,'-','');
begin
 if current_user<>'postgres' then raise exception 'test_fixture_postgres_only'; end if;
 insert into public.creator_payout_accounts(creator_user_id,provider,provider_environment,provider_account_id,
  status,country,default_currency,details_submitted,payouts_enabled,transfers_capability_status,onboarding_status,kyc_status,tax_status,
  last_provider_sync_at,provider_configuration_observed_at,provider_configuration_account_id,provider_configuration_status,
  provider_expected_configuration_key,provider_configuration_key,provider_account_type,provider_controller_type,provider_is_controller,
  provider_dashboard_type,provider_fees_payer,provider_fees_payer_raw,provider_losses_collector,provider_requirements_collection)
 values(p_creator::text,'stripe_connect','test',account,'eligible','US','usd',true,true,'active','ready_for_payouts','verified','verified',
  now(),now(),account,'match','stripe_connect_test_express_controller_v1','stripe_connect_test_express_controller_v1',
  'express','application',true,'express','platform','application','platform','stripe');
 insert into private.creator_provider_observation_jobs(account_id,creator_id,environment,provider_account_id,observed_at)
 select id,creator_user_id::uuid,provider_environment,provider_account_id,provider_configuration_observed_at
 from public.creator_payout_accounts where creator_user_id=p_creator::text and provider_environment='test'
 on conflict(account_id) do update set observed_at=excluded.observed_at;
 if private.ordinary_creator_provider_ready(p_creator,'sandbox') is not true then
  raise exception 'test_fixture_synthetic_provider_not_ready'; end if;
end $$;
revoke all on function pg_temp.seed_synthetic_creator_provider(uuid) from public,anon,authenticated,service_role;

create function pg_temp.declare_sandbox_creator(p_creator uuid,p_session uuid) returns void
language plpgsql set search_path='' as $$
declare old_claims text:=current_setting('request.jwt.claims',true);
 old_role text:=current_setting('request.jwt.claim.role',true);
begin
 if current_user<>'postgres' then raise exception 'test_fixture_postgres_only'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',p_creator,'session_id',p_session)::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 perform public.declare_creator_money_eligibility(true,'US','CA','adult-us-creator-v1');
 if not exists(select 1 from public.wave1_creator_eligibility where creator_user_id=p_creator
  and state='PENDING_VERIFICATION' and tax_complete is null and sanctions_clear is null)
 then raise exception 'test_fixture_declaration_must_leave_compliance_unknown'; end if;
 if private.ordinary_creator_subject_for_mode(p_creator,'sandbox') is not true
  or public.wave1_creator_money_subject_authorized_internal(p_creator) is not false
 then raise exception 'test_fixture_sandbox_not_financial_authority'; end if;
 perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 perform set_config('request.jwt.claim.role',coalesce(old_role,''),true);
end $$;
revoke all on function pg_temp.declare_sandbox_creator(uuid,uuid) from public,anon,authenticated,service_role;
