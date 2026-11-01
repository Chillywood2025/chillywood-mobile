begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(8);
select is(private.commerce_provider_mode('sandbox'),'test','merch sandbox normalized');
select is(private.commerce_provider_mode('production'),'live','merch production normalized');
select is(private.commerce_provider_mode('test'),'test','auction test preserved');
select is(private.commerce_provider_mode('live'),'live','auction live preserved');
select is(private.commerce_provider_mode('setup'),null::text,'unknown mode cannot acquire authority');
select ok(not has_function_privilege('authenticated','public.get_merch_fee_report_import_context(uuid)','execute'),'clients cannot import fees');
select ok(has_function_privilege('service_role','public.get_merch_fee_report_import_context(uuid)','execute'),'server context remains available');
select ok(exists(select 1 from pg_trigger where tgrelid='private.auction_transfer_operations'::regclass
 and tgname='auction_transfer_provider_mode' and tgenabled='O'),'test transfer rejects live contracts');
select * from finish();
rollback;
