-- Synthetic, disposable local database evidence only. Never a deployment seed.
insert into public.creator_payout_accounts(creator_user_id,provider,provider_environment,provider_account_id,
  provider_account_type,provider_controller_type,provider_is_controller,provider_dashboard_type,
  provider_fees_payer,provider_fees_payer_raw,provider_losses_collector,provider_requirements_collection,
  provider_configuration_observed_at,provider_configuration_account_id,provider_configuration_status,provider_expected_configuration_key,
  charges_enabled,payouts_enabled,details_submitted,onboarding_status)
select user_id,'stripe_connect','test','acct_fixture','none','application',true,'express',
  'platform','application','platform','stripe',now(),'acct_fixture','match','stripe_connect_test_express_controller_v1',
  true,true,true,'ready_for_payouts'
from event_reservation_fixture.actors where kind='creator';
