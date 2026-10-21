begin;
select plan(16);
select ok(not (select expiry_enabled from private.platform_brand_retention_settings),'brand expiry defaults disabled');
select has_function('public','read_platform_brand_retention_binding',array['uuid'],'service exact-incarnation reader exists');
select has_function('public','record_platform_brand_retention_proof',array['uuid','jsonb','jsonb'],'real scan-receipt qualification exists');
select ok(not has_function_privilege('authenticated','public.record_platform_brand_retention_proof(uuid,jsonb,jsonb)','EXECUTE'),'client cannot qualify itself');
select ok(not has_function_privilege('anon','public.claim_platform_brand_retention_expiry(uuid)','EXECUTE'),'anonymous cannot claim');
select ok(has_function_privilege('authenticated','public.remove_platform_brand_asset(uuid)','EXECUTE'),'owner removal RPC available');
select is((select count(*)::int from pg_trigger where tgrelid='storage.objects'::regclass and tgfoid='private.guard_platform_brand_storage_incarnation()'::regprocedure and tgenabled in ('O','A')),1,'metadata storage fence installed');
insert into storage.objects(id,bucket_id,name,version)
values('f7500000-0000-4000-8000-000000000001','platform-brand-assets','brand-retention-fixture/logo/object.png','brand-fixture-v1');
insert into public.platform_brand_assets(id,owner_user_id,asset_type,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type)
values('f7500000-0000-4000-8000-000000000002','brand-retention-fixture','logo','supabase','platform-brand-assets','brand-retention-fixture/logo/object.png','brand-retention-fixture/logo/object.png','image/png');
select is(public.read_platform_brand_retention_binding('f7500000-0000-4000-8000-000000000002')->>'storageVersion','brand-fixture-v1','binding uses exact storage generation');
-- Native Storage rejects direct SQL DELETE at its statement-level protection
-- before the brand row fence. Do not disable that API boundary for this test.
select throws_ok($$delete from storage.objects where id='f7500000-0000-4000-8000-000000000001'$$,'42501',null,'native Storage protection rejects direct SQL deletion before brand row fencing');
select throws_ok($$update storage.objects set version='replacement' where id='f7500000-0000-4000-8000-000000000001'$$,'P0001','brand_storage_attached_incarnation_fenced','attached overwrite denied');
select lives_ok($$update storage.objects set last_accessed_at=clock_timestamp() where id='f7500000-0000-4000-8000-000000000001'$$,'ordinary read bookkeeping stays permitted');
insert into storage.objects(bucket_id,name,version)
values('platform-brand-assets','brand-retention-fixture/unattached.png','v1');
select throws_ok($$delete from storage.objects where bucket_id='platform-brand-assets' and name='brand-retention-fixture/unattached.png'$$,
  '42501',null,'unattached cleanup also requires the Storage API, not direct SQL');
-- This pgTAP test does not prove Storage API cleanup. The disposable metadata
-- lifecycle test separately exercises the brand fence's unattached exception.
update public.platform_brand_assets set deleted_at='2020-01-01' where id='f7500000-0000-4000-8000-000000000002';
select ok((select deleted_at>clock_timestamp()-interval '1 minute' from public.platform_brand_assets where id='f7500000-0000-4000-8000-000000000002'),'client timestamp cannot shorten retention');
select ok((select retain_until-removed_at=interval '720 hours' from private.platform_brand_object_incarnations where asset_id='f7500000-0000-4000-8000-000000000002'),'retention interval is exactly 720 hours');
select throws_ok($$update public.platform_brand_assets set deleted_at=null where id='f7500000-0000-4000-8000-000000000002'$$,'P0001','brand_retention_tombstone_permanent','tombstone cannot be reset');
select is(public.claim_platform_brand_retention_expiry('f7500000-0000-4000-8000-000000000002')->>'status','disabled','metadata fencing never enables provider cleanup');
select * from finish();
rollback;
