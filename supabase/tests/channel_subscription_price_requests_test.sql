begin;
select no_plan();

-- Real session/legal/eligibility roots, not replacement auth functions. All
-- synthetic evidence and writes are rolled back; no provider is contacted.
create temporary table subscription_request_creators as
select creator_id, md5('subscription-request-session:' || creator_id)::uuid session_id,
  row_number() over (order by creator_id) fixture_number
from (
  select md5('subscription-price-request-test:' || candidate)::uuid creator_id
  from generate_series(1, 10000) candidate
) candidates
where mod(hashtextextended('chillywood-wave1-us-rollout-v1:' || creator_id, 20260814), 100) = 0
order by creator_id limit 2;
grant select on pg_temp.subscription_request_creators to authenticated;
insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at)
select creator_id,false,false,now() from pg_temp.subscription_request_creators;
insert into auth.sessions(id,user_id)
select session_id,creator_id from pg_temp.subscription_request_creators;
insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,
  market,role_key,capability,session_generation,authority_source)
select fixture.creator_id,public.wave1_sha256(fixture.creator_id::text),document.document_key,
  document.version,document.market,'member',document.capability,fixture.session_id::text,'service_reconciliation'
from pg_temp.subscription_request_creators fixture cross join public.wave1_legal_document_versions document
where document.active and document.market='UNITED_STATES'
  and document.capability in ('account','creator','creator_money');
do $$ declare fixture record; begin
  for fixture in select * from pg_temp.subscription_request_creators loop
    perform public.wave1_evaluate_creator_eligibility(fixture.creator_id,jsonb_build_object(
      'accountStatus','ACTIVE','age18Plus',true,'legalAccepted',true,'creatorRole',true,
      'moderationState','CLEAR','market','UNITED_STATES','rolloutEligible',true,
      'platformCapability',true,'providerEligible',true,'kycComplete',true,'taxComplete',true,
      'sanctionsClear',true,'payoutEligible',true,'inputVersions',jsonb_build_object('evaluationSequence',1)),
      'subscription-price-request-test','local_pgtap');
  end loop;
end $$;

create temporary table subscription_request_baseline as select
  (select coalesce(jsonb_agg(to_jsonb(offer) order by id),'[]'::jsonb) from public.creator_channel_subscription_offers offer) offers,
  (select count(*) from public.monetization_products) product_count,
  (select count(*) from public.monetization_product_store_mappings) mapping_count;
create temporary table subscription_request_results(value jsonb);
grant select,insert on pg_temp.subscription_request_results to authenticated;

select ok((select relrowsecurity and relforcerowsecurity from pg_class
  where oid='public.creator_channel_subscription_price_requests'::regclass),'price requests force RLS');
select ok(has_table_privilege('authenticated','public.creator_channel_subscription_price_requests','SELECT')
  and not has_table_privilege('authenticated','public.creator_channel_subscription_price_requests','INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon','public.creator_channel_subscription_price_requests','SELECT,INSERT,UPDATE,DELETE'),
  'clients can read through RLS but cannot mutate request state directly');
select ok(has_function_privilege('authenticated','public.request_creator_channel_subscription_price(integer,text)','EXECUTE')
  and not has_function_privilege('anon','public.request_creator_channel_subscription_price(integer,text)','EXECUTE'),
  'only authenticated clients can invoke the request entry point');

set local role anon;
select throws_ok($$select public.request_creator_channel_subscription_price(1299,'usd')$$,
  '42501','permission denied for function request_creator_channel_subscription_price','anonymous request denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',creator_id,
  'session_id',session_id)::text,true) from pg_temp.subscription_request_creators where fixture_number=1;
select is(public.wave1_session_authority_readback()->>'state','ACTIVE','fixture uses real active session');
insert into pg_temp.subscription_request_results values(public.request_creator_channel_subscription_price(1299,'usd'));
select is((select value->>'status' from pg_temp.subscription_request_results limit 1),'pending_provisioning','request is explicitly non-chargeable');
select is((select (value->>'amountMinor')::integer from pg_temp.subscription_request_results limit 1),1299,'desired amount is exact, not mapped to 499');
select is(public.request_creator_channel_subscription_price(1299,'usd')->>'id',
  (select value->>'id' from pg_temp.subscription_request_results limit 1),'same creator and amount retries dedupe');
select throws_ok($$select public.request_creator_channel_subscription_price(0,'usd')$$,'P0001','subscription_price_request_invalid','zero is not a requestable price');
select throws_ok($$select public.request_creator_channel_subscription_price(-1,'usd')$$,'P0001','subscription_price_request_invalid','negative amount is rejected');
select throws_ok($$select public.request_creator_channel_subscription_price(1299,'eur')$$,'P0001','subscription_price_request_invalid','unsupported currency is rejected');
select lives_ok($$select public.request_creator_channel_subscription_price(amount,'usd') from (values(1300),(1301),(1302),(1303)) amounts(amount)$$,
  'five distinct pending requests fit the bounded queue');
select throws_ok($$select public.request_creator_channel_subscription_price(1304,'usd')$$,'P0001','subscription_price_request_limit','sixth distinct pending request is rejected');
select is(public.request_creator_channel_subscription_price(1299,'usd')->>'id',
  (select value->>'id' from pg_temp.subscription_request_results limit 1),'dedupe still succeeds when queue is full');
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',creator_id,
  'session_id',session_id)::text,true) from pg_temp.subscription_request_creators where fixture_number=2;
select is((select count(*) from public.creator_channel_subscription_price_requests),0::bigint,'second creator cannot read first creator pending requests');
select isnt(public.request_creator_channel_subscription_price(1299,'usd')->>'id',
  (select value->>'id' from pg_temp.subscription_request_results limit 1),'another creator gets a different owned request');
select is((select count(*) from public.creator_channel_subscription_price_requests),1::bigint,'second creator can read only their own request');
reset role;
select is((select count(*) from public.creator_channel_subscription_price_requests where creator_id=
  (select creator_id from pg_temp.subscription_request_creators where fixture_number=1)),5::bigint,'first creator has only five durable requests');
select is((select coalesce(jsonb_agg(to_jsonb(offer) order by id),'[]'::jsonb) from public.creator_channel_subscription_offers offer),
  (select offers from pg_temp.subscription_request_baseline),'requests never mutate subscription offers or cohorts');
select is((select count(*) from public.monetization_products),(select product_count from pg_temp.subscription_request_baseline),'requests never create products');
select is((select count(*) from public.monetization_product_store_mappings),(select mapping_count from pg_temp.subscription_request_baseline),'requests never create provider mappings');
update auth.sessions set not_after=now()-interval '1 second'
where id=(select session_id from pg_temp.subscription_request_creators where fixture_number=2);
set local role authenticated;
select throws_ok($$select public.request_creator_channel_subscription_price(1400,'usd')$$,
  'P0001','creator_session_authority_required','expired exact session cannot enqueue requests');
reset role;
select * from finish();
rollback;
