begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(13);
select has_table('private','stripe_refund_tax_evidence','immutable refund tax evidence exists');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='private.stripe_refund_tax_evidence'::regclass),'evidence FORCE RLS');
select ok(not has_table_privilege('service_role','private.stripe_refund_tax_evidence','INSERT,UPDATE,DELETE'),'no direct service writes');
select ok(not has_function_privilege('authenticated','public.record_google_refund_tax_evidence(uuid,jsonb)','execute')
 and not has_function_privilege('anon','public.record_google_refund_tax_evidence(uuid,jsonb)','execute'),'clients cannot certify tax');
select ok(has_function_privilege('service_role','public.record_google_refund_tax_evidence(uuid,jsonb)','execute'),'bounded server ingestion available');
select ok(not has_function_privilege('service_role','private.ingest_refund_tax_facts(jsonb)','execute'),'internal ingestion inaccessible');
select ok(not private.refund_tax_evidence_valid('{}'::jsonb),'missing evidence fails closed');
create temporary table refund_tax_fixture as select '{"payment_intent_id":"pi_fixture","currency":"usd","gross_minor":1000,
 "tax_minor":100,"refunded_minor":500,"tax_reversal_minor":49,"refunds":[{"id":"re_fixture","amount":500}],
 "refund_tax_evidence":{"provenance":"stripe_tax_association_get_v1","association_id":"taxa_fixture",
 "original_tax_transaction_id":"tax_original","payment_intent_id":"pi_fixture","currency":"usd","gross_minor":1000,
 "original_tax_minor":100,"refunded_minor":500,"tax_reversal_minor":49,
 "refunds":[{"refund_id":"re_fixture","refund_minor":500,"tax_reversal_minor":49,"tax_transaction_id":"tax_refund"}]}}'::jsonb facts;
select ok(private.refund_tax_evidence_valid((select facts from refund_tax_fixture)),'exact provider amounts accepted without proportional guessing');
select ok(not private.refund_tax_evidence_valid((select facts||'{"tax_reversal_minor":50}' from refund_tax_fixture)),'aggregate mismatch rejected');
select ok(not private.refund_tax_evidence_valid((select facts||'{"currency":"eur"}' from refund_tax_fixture)),'currency mismatch rejected');
select ok(not private.refund_tax_evidence_valid((select facts||'{"payment_intent_id":"pi_other"}' from refund_tax_fixture)),'cross-payment rejected');
select ok(not private.refund_tax_evidence_valid((select jsonb_set(facts,'{refund_tax_evidence,refunds,0,refund_minor}','501') from refund_tax_fixture)),'wrong refund amount rejected');
select ok(not private.refund_tax_evidence_valid((select jsonb_set(facts,'{refund_tax_evidence,refunds,0,tax_transaction_id}','"tax_original"') from refund_tax_fixture)),'original cannot be used as reversal');
select * from finish();
rollback;
