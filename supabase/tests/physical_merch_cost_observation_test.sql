begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(14);
select has_table('private','merch_provider_cost_observations','immutable provider observations exist');
select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid in
 ('private.merch_provider_cost_observations'::regclass,'private.merch_held_net_allocations'::regclass)),'private tables FORCE RLS');
select ok(not has_function_privilege('authenticated','public.record_merch_provider_cost_observation(uuid,jsonb)','execute')
 and not has_function_privilege('anon','public.record_merch_provider_cost_observation(uuid,jsonb)','execute'),'clients cannot submit fee proof');
select ok(has_function_privilege('service_role','public.record_merch_provider_cost_observation(uuid,jsonb)','execute'),'service adapter has bounded RPC access');
select ok(not has_table_privilege('service_role','private.merch_provider_cost_observations','INSERT,UPDATE,DELETE'),'no direct service table writes');
create temporary table merch_cost_baseline as select count(*) n from public.creator_earnings_ledger;
insert into public.merch_orders(id,buyer_id,provider,environment,order_status,fulfillment_status,payment_status,
 amount_subtotal_minor,amount_total_minor,currency,stripe_checkout_session_id,stripe_payment_intent_id)
values('e7200000-0000-4000-8000-000000000001','e7200000-0000-4000-8000-000000000002',
 'stripe_physical_goods','sandbox','paid','not_started','paid',1000,1000,'usd','cs_test_native_cost_fixture','pi_native_cost_fixture');
create temporary table merch_cost_fixture as select '{
 "account_id":"acct_native_synthetic","environment":"sandbox","order_id":"e7200000-0000-4000-8000-000000000001",
 "checkout_id":"cs_test_native_cost_fixture","payment_intent_id":"pi_native_cost_fixture",
 "charge_id":"ch_native_cost_fixture","balance_id":"txn_native_cost_fixture","currency":"usd",
 "gross_minor":1000,"provider_fee_minor":30,"charge_net_minor":970,"tax_minor":100,"refunded_minor":0,
 "disputed":false,"balance_status":"available","refunds":[],"tax_reversal_minor":0,
 "adjustments_qualified":false,"financial_authority":false}'::jsonb facts;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select lives_ok($$select public.get_merch_cost_reconciliation_context('e7200000-0000-4000-8000-000000000001')$$,'exact stored order context');
select lives_ok($$select public.record_merch_provider_cost_observation('e7200000-0000-4000-8000-000000000001',(select facts from merch_cost_fixture))$$,'synthetic provider cost observation accepted');
select is((select net_minor from private.merch_held_net_allocations where order_id='e7200000-0000-4000-8000-000000000001'),870::bigint,'observed net excludes fee and tax once');
select is((select creator_minor from private.merch_held_net_allocations where order_id='e7200000-0000-4000-8000-000000000001'),783::bigint,'90 percent creator net');
select is(public.record_merch_provider_cost_observation('e7200000-0000-4000-8000-000000000001',(select facts from merch_cost_fixture))->>'status','duplicate','retry idempotent');
select is((select count(*) from private.merch_held_net_allocations where order_id='e7200000-0000-4000-8000-000000000001'),1::bigint,'one held allocation');
select ok((select not financial_authority and 'merch_return_window_policy_unqualified'=any(hold_reasons)
 from private.merch_held_net_allocations where order_id='e7200000-0000-4000-8000-000000000001'),'unknown return policy never releases money');
select throws_ok($$delete from private.merch_provider_cost_observations where order_id='e7200000-0000-4000-8000-000000000001'$$,'P0001','merch_cost_evidence_append_only','original evidence cannot be erased');
select is((select count(*) from public.creator_earnings_ledger),(select n from merch_cost_baseline),'no payable earnings minted');
select * from finish();
rollback;
