begin;
select plan(23);

-- Disposable native pgTAP transaction only. Production-shaped catalog/provider
-- facts below are SYNTHETIC test inputs, not provider verification or activation.
-- No provider is contacted. All rows, controls and trigger fixtures roll back.
insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at) values
 ('d9600000-0000-4000-8000-000000000001',false,false,now()),
 ('d9600000-0000-4000-8000-000000000002',false,false,now());
insert into auth.sessions(id,user_id,not_after) values
 ('d9610000-0000-4000-8000-000000000001','d9600000-0000-4000-8000-000000000001',now()+interval '1 day'),
 ('d9610000-0000-4000-8000-000000000002','d9600000-0000-4000-8000-000000000002',now()+interval '1 day');
insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,
 role_key,capability,session_generation,authority_source)
select s.user_id,public.wave1_sha256(s.user_id::text),d.document_key,d.version,d.market,'member',d.capability,s.id::text,'service_reconciliation'
from auth.sessions s cross join public.wave1_legal_document_versions d
where s.user_id in ('d9600000-0000-4000-8000-000000000001','d9600000-0000-4000-8000-000000000002')
 and d.active and d.market='UNITED_STATES' and (d.capability='account'
 or (s.user_id='d9600000-0000-4000-8000-000000000001' and d.capability in ('creator','creator_money')));

insert into public.monetization_products(id,product_key,product_type,display_name,provider,provider_product_id,provider_base_plan_id,
 revenuecat_entitlement,environment,status,is_android_digital,metadata) values
 ('d9630000-0000-4000-8000-000000000001','pgtap_reviewed_production_premium','premium_subscription','SYNTHETIC production Premium',
 'revenuecat_google_play','pgtap_reviewed_production_premium','monthly','premium','production','active',true,
 '{"provider_proof":true,"live_money_enabled_at_activation":true,"fixture":"SYNTHETIC ONLY, NOT PROVIDER VERIFICATION"}');
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.platform_money_kill_switches set state='on',reason='SYNTHETIC DISPOSABLE PG-TAP ONLY'
where key in ('revenuecat_google_play_enabled','provider_webhooks_enabled','live_money_enabled',
 'digital_sales_enabled','creator_monetization_enabled','stripe_connect_enabled','merch_enabled');
reset role;
select set_config('request.jwt.claim.role','',true);
select set_config('request.jwt.claims','{}',true);
select is(public.process_revenuecat_premium_event_atomic(
 'revenuecat_google_play','pgtap-reviewed-production-premium','INITIAL_PURCHASE','d9600000-0000-4000-8000-000000000001',
 'pgtap_reviewed_production_premium','monthly','production','active',now()-interval '1 minute',now()+interval '1 day',now(),
 999,'usd',repeat('b',64),'NORMAL','google_play','android',null,'d9630000-0000-4000-8000-000000000001',
 'pgtap-reviewed-production-original')->>'status','processed','finite production Premium comes from the canonical processor');

-- Independent complete compliance/provider facts deliberately supplied by this
-- trusted test, never inferred from a self-declaration or a provider response.
insert into public.creator_payout_accounts(creator_user_id,provider,provider_environment,provider_account_id,
 status,country,default_currency,details_submitted,payouts_enabled,transfers_capability_status,onboarding_status,kyc_status,tax_status,
 last_provider_sync_at,provider_configuration_observed_at,provider_configuration_account_id,provider_configuration_status,
 provider_expected_configuration_key,provider_configuration_key,provider_account_type,provider_controller_type,provider_is_controller,
 provider_dashboard_type,provider_fees_payer,provider_fees_payer_raw,provider_losses_collector,provider_requirements_collection,provider_live_observation)
values('d9600000-0000-4000-8000-000000000001','stripe_connect','live','acct_syntheticReviewedCreator',
 'eligible','US','usd',true,true,'active','ready_for_payouts','verified','verified',now(),now(),'acct_syntheticReviewedCreator','match',
 'stripe_connect_live_express_recipient_controller_v1','stripe_connect_live_express_recipient_controller_v1',
 'express','application',true,'express','platform','application','platform','stripe',
 '{"accountId":"acct_syntheticReviewedCreator","platformAccountId":"acct_syntheticReviewedPlatform","environment":"live","modeVerified":true,"v2Dashboard":"express","v2FeesCollector":"application","v2LossesCollector":"application","source":"authenticated_stripe_get_v1_v2","pendingVerification":[],"requirementsComplete":true,"recipientTransfers":"active","payoutSchedule":"manual"}');
insert into private.creator_provider_observation_jobs(account_id,creator_id,environment,provider_account_id,observed_at)
select id,creator_user_id::uuid,provider_environment,provider_account_id,provider_configuration_observed_at
from public.creator_payout_accounts where creator_user_id='d9600000-0000-4000-8000-000000000001'
on conflict(account_id) do update set observed_at=excluded.observed_at;
select public.wave1_evaluate_creator_eligibility('d9600000-0000-4000-8000-000000000001',
 '{"accountStatus":"ACTIVE","age18Plus":true,"legalAccepted":true,"creatorRole":true,"moderationState":"CLEAR","market":"UNITED_STATES","rolloutEligible":false,"platformCapability":true,"providerEligible":true,"kycComplete":true,"taxComplete":true,"sanctionsClear":true,"payoutEligible":true,"inputVersions":{"evaluationSequence":1}}',
 'synthetic-reviewed-merch-complete-facts','local_pgtap');
select ok(private.ordinary_creator_subject_for_mode('d9600000-0000-4000-8000-000000000001','production'),
 'positive control has strict current production creator authority');
select ok(not exists(select 1 from public.user_entitlements where user_id='d9600000-0000-4000-8000-000000000002' and entitlement_key='premium')
 and not exists(select 1 from public.access_grants where user_id='d9600000-0000-4000-8000-000000000002' and grant_type='premium'),
 'ordinary peer remains Free');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='private.merch_publication_confirmation_context'::regclass),
 'reviewed confirmation context forces RLS');
select ok((select bool_and(not has_table_privilege(role_name,'private.merch_publication_confirmation_context','SELECT,INSERT,UPDATE,DELETE'))
 from (values('anon'),('authenticated'),('service_role')) roles(role_name)),
 'no API role can read or forge private confirmation context');
select ok(has_function_privilege('authenticated','public.confirm_creator_merch_live_publication(uuid)','EXECUTE')
 and not has_function_privilege('anon','public.confirm_creator_merch_live_publication(uuid)','EXECUTE')
 and not has_function_privilege('service_role','public.confirm_creator_merch_live_publication(uuid)','EXECUTE'),
 'only the exact authenticated creator flow can confirm a review');

insert into public.provider_readiness_status(provider,capability,status,environment,is_live_money_enabled,proof_source,proof_summary,last_checked_at)
values('stripe','platform_commerce','active','production',true,'SYNTHETIC','SYNTHETIC DISPOSABLE TEST ONLY',now())
on conflict(provider,capability,environment) do update set status='active',is_live_money_enabled=true,
 proof_source='SYNTHETIC',proof_summary='SYNTHETIC DISPOSABLE TEST ONLY',last_checked_at=now();
insert into private.merch_live_checkout_qualifications values
 ('acct_syntheticReviewedPlatform',repeat('a',64),repeat('b',64),repeat('c',64),now()+interval '1 hour',null);
insert into private.commerce_tax_qualifications(feature,product_id,account_id,environment,permitted_scope,platform_scope,
 full_permitted_scope_reviewed,professional_basis_reference,coverage_evidence_reference,collection_mode,liability_type,tax_code,tax_behavior,
 registration_evidence_reference,provider_settings_evidence_reference,provider_product_evidence_reference,provider_verified_at,provider_expires_at,expires_at,enabled)
values('physical_merch','d9620000-0000-4000-8000-000000000001','acct_syntheticReviewedPlatform','production','US_all_destinations','all_supported_platforms',
 true,'SYNTHETIC','SYNTHETIC','automatic','self','txcd_99999999','inclusive','SYNTHETIC','SYNTHETIC','SYNTHETIC',now(),now()+interval '1 hour',now()+interval '1 hour',true);

create temporary table reviewed_merch_results(key text primary key,value jsonb);
grant select,insert,update on pg_temp.reviewed_merch_results to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"d9600000-0000-4000-8000-000000000001","session_id":"d9610000-0000-4000-8000-000000000001"}',true);
insert into pg_temp.reviewed_merch_results values('draft',public.save_creator_merch_product_with_tracking(
 'd9620000-0000-4000-8000-000000000001','SYNTHETIC reviewed item','Physical test item',null,1000,10,'draft',null,'tracked'));
select is((select value->>'environment' from pg_temp.reviewed_merch_results where key='draft'),'sandbox',
 'real writer creates a sandbox draft even while production mode is selected');
insert into pg_temp.reviewed_merch_results values('review',public.review_creator_merch_live_publication(
 'd9620000-0000-4000-8000-000000000001',(select (value->>'updatedAt')::timestamptz from pg_temp.reviewed_merch_results where key='draft')));
select is((select (value->>'ready')::boolean from pg_temp.reviewed_merch_results where key='review'),true,
 'real review accepts exact production membership and independent current qualifications');
select throws_ok($$select public.save_creator_merch_product_with_tracking(
 'd9620000-0000-4000-8000-000000000001','SYNTHETIC reviewed item','Physical test item',null,1000,10,'published',
 (select (value->>'updatedAt')::timestamptz from pg_temp.reviewed_merch_results where key='draft'),'tracked')$$,
 '42501','creator_mode_changed','direct sandbox publication cannot borrow live mode without private reviewed context');
reset role;
create temporary table reviewed_merch_before as select to_jsonb(p) product,
 (select jsonb_agg(to_jsonb(v) order by v.id) from public.merch_product_variants v where v.product_id=p.id) variants
from public.merch_products p where p.id='d9620000-0000-4000-8000-000000000001';
select ok((select environment='sandbox' and publication_status='draft' from public.merch_products where id='d9620000-0000-4000-8000-000000000001'),
 'failed direct publication leaves the exact product a sandbox draft');

-- Inject only a test failure after the real confirmation establishes context.
-- Application authority, writer, triggers, RLS and review checks stay real.
create function pg_temp.fail_reviewed_merch_save() returns trigger language plpgsql set search_path='' as $$
begin
 if new.id='d9620000-0000-4000-8000-000000000001' and new.publication_status='published' then
  if not exists(select 1 from private.merch_publication_confirmation_context where transaction_id=txid_current() and product_id=new.id)
  then raise exception 'synthetic_confirmation_context_missing'; end if;
  raise exception 'synthetic_reviewed_save_failed';
 end if;
 return new;
end $$;
revoke all on function pg_temp.fail_reviewed_merch_save() from public,anon,authenticated,service_role;
create trigger aaa_synthetic_reviewed_save_failure before update on public.merch_products
for each row execute function pg_temp.fail_reviewed_merch_save();
set local role authenticated;
select throws_ok($$select public.confirm_creator_merch_live_publication(
 (select (value->>'reviewId')::uuid from pg_temp.reviewed_merch_results where key='review'))$$,
 'P0001','synthetic_reviewed_save_failed','inner canonical save is reached with private transaction/product context');
reset role;
drop trigger aaa_synthetic_reviewed_save_failure on public.merch_products;
drop function pg_temp.fail_reviewed_merch_save();
select ok((select to_jsonb(p) is not distinct from b.product
 and (select jsonb_agg(to_jsonb(v) order by v.id) from public.merch_product_variants v where v.product_id=p.id) is not distinct from b.variants
 from public.merch_products p cross join pg_temp.reviewed_merch_before b where p.id='d9620000-0000-4000-8000-000000000001'),
 'inner save failure rolls back the entire product, publication mode and variant inventory');
select is((select count(*)::integer from private.merch_publication_confirmation_context),0,'failed confirmation retains no private context');
select is((select count(*)::integer from private.merch_publication_receipts where product_id='d9620000-0000-4000-8000-000000000001'),0,
 'failed confirmation retains no publication receipt');

set local role authenticated;
update pg_temp.reviewed_merch_results set value=public.review_creator_merch_live_publication(
 'd9620000-0000-4000-8000-000000000001',(select (value->>'updatedAt')::timestamptz from pg_temp.reviewed_merch_results where key='draft')) where key='review';
select is((select (value->>'ready')::boolean from pg_temp.reviewed_merch_results where key='review'),true,'new review remains valid after rolled-back inner save');
insert into pg_temp.reviewed_merch_results values('published',public.confirm_creator_merch_live_publication(
 (select (value->>'reviewId')::uuid from pg_temp.reviewed_merch_results where key='review')));
select ok((select value->>'environment'='production' and value->>'publicationStatus'='published' from pg_temp.reviewed_merch_results where key='published'),
 'reviewed confirmation reuses canonical save then atomically promotes the sandbox draft');
reset role;
select ok((select environment='production' and publication_status='published' and status='active' from public.merch_products where id='d9620000-0000-4000-8000-000000000001'),
 'stored product agrees with the production publication response');
select is((select count(*)::integer from private.merch_publication_confirmation_context),0,'successful confirmation cleans private context');
select is((select count(*)::integer from private.merch_publication_receipts where product_id='d9620000-0000-4000-8000-000000000001'),1,
 'successful confirmation retains exactly one immutable receipt');
create temporary table reviewed_merch_published_before as select to_jsonb(p) product from public.merch_products p where id='d9620000-0000-4000-8000-000000000001';
set local role authenticated;
select is(public.confirm_creator_merch_live_publication((select (value->>'reviewId')::uuid from pg_temp.reviewed_merch_results where key='review'))->>'id',
 'd9620000-0000-4000-8000-000000000001','same reviewed receipt retry acknowledges the existing product');
reset role;
select ok((select to_jsonb(p) is not distinct from b.product from public.merch_products p cross join pg_temp.reviewed_merch_published_before b
 where p.id='d9620000-0000-4000-8000-000000000001'),'receipt retry does not mutate publication or stock');
select is((select count(*)::integer from private.merch_publication_receipts where product_id='d9620000-0000-4000-8000-000000000001'),1,
 'receipt retry never duplicates publication authority');
select ok(not exists(select 1 from public.user_entitlements where user_id='d9600000-0000-4000-8000-000000000002' and entitlement_key='premium')
 and not exists(select 1 from public.access_grants where user_id='d9600000-0000-4000-8000-000000000002' and grant_type='premium'),
 'publication and recovery never grant the ordinary peer Premium');
select * from finish();
rollback;
