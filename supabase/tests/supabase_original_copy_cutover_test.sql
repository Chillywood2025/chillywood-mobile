begin;
select no_plan();
select has_table('private',t,'immutable cutover proof table exists') from unnest(array[
 'supabase_original_copy_cutovers','supabase_copy_scan_observations','supabase_copy_scan_receipts']) t;
select ok(c.relrowsecurity and c.relforcerowsecurity,'proof table forces RLS: '||c.relname)
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private'
 and c.relname in ('supabase_original_copy_cutovers','supabase_copy_scan_observations','supabase_copy_scan_receipts');
select ok(not has_table_privilege(r,'private.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),r||' cannot directly access '||t)
 from unnest(array['anon','authenticated','service_role']) r cross join unnest(array[
 'supabase_original_copy_cutovers','supabase_copy_scan_observations','supabase_copy_scan_receipts']) t;
select is(has_function_privilege(r,f,'execute'),r='service_role',r||' exact RPC scope: '||f)
 from unnest(array['anon','authenticated','service_role']) r cross join unnest(array[
 'public.read_supabase_original_copy_cutover(uuid)',
 'public.commit_supabase_original_copy_cutover(uuid,uuid,text,jsonb)',
 'public.begin_supabase_copy_scan_observation(uuid,text,integer)',
 'public.record_supabase_copy_scan_receipt(uuid,uuid,text,text,bigint)',
 'public.enroll_supabase_copy_retention_provenance(uuid,uuid,text,text)']) f;
select ok(not has_function_privilege(r,f,'execute'),r||' cannot bypass new wrapper via '||f)
 from unnest(array['anon','authenticated','service_role']) r cross join unnest(array[
 'public.has_verified_legacy_media_object_provenance_before_copy_cutover(text,text,text,text,text)',
 'public.has_verified_legacy_video_object_provenance_before_copy_cutover(uuid,text,text,text)',
 'private.supabase_copy_provenance_current(private.deleted_media_legacy_provenance)']) f;
select has_check('private','deleted_media_legacy_provenance','tagged provenance has strict evidence constraint');
select ok(exists(select 1 from pg_constraint where conrelid='private.deleted_media_legacy_provenance'::regclass
 and conname='deleted_media_provenance_kind_exact' and convalidated),'exact historical/copy evidence XOR is validated');
select ok(not exists(select 1 from private.supabase_original_copy_cutovers),'installation performs no locator cutover');
select ok(not exists(select 1 from private.supabase_copy_scan_receipts),'installation fabricates no scanner receipts');
select * from finish();
rollback;
