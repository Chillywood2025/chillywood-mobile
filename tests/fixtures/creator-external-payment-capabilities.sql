-- Synthetic, disposable local database evidence only. Never a deployment seed.
update public.platform_money_kill_switches set state='sandbox_only' where key in ('tips_enabled','provider_webhooks_enabled');
insert into public.creator_tip_settings(creator_id,tips_enabled,status,provider_charges_enabled,provider_payouts_enabled)
select user_id,true,'active',true,true from event_reservation_fixture.actors where kind='creator';
insert into private.creator_external_payment_capabilities(id,feature,creator_id,provider_account_id,
  platform,storefront,storefront_country,route_kind,currency,environment,payment_method,min_amount_minor,max_amount_minor,
  provider_bounds_evidence,route_approval_evidence,verified_at,expires_at,enabled)
select 'ef000000-0000-4000-8000-000000000001','creator_tip',user_id,'acct_fixture',
  'ios','synthetic-approved-storefront','US','external_browser_checkout','usd','test','card',50,100000,
  'synthetic local provider-bound assertion; not real provider proof','synthetic local route approval; not release authority',
  now()-interval '1 minute',now()+interval '1 hour',true
from event_reservation_fixture.actors where kind='creator';
insert into private.creator_external_payment_eligibility(capability_id,buyer_id,session_id,eligibility_evidence,verified_at,expires_at)
select 'ef000000-0000-4000-8000-000000000001',user_id,session_id,
  'synthetic trusted session/platform/storefront eligibility; not a client assertion',now()-interval '1 minute',now()+interval '10 minutes'
from event_reservation_fixture.actors where kind like 'buyer%';
