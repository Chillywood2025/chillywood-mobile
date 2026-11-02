begin;
select plan(21);

select ok(not enabled,'pool migration leaves activation off') from private.creator_clip_export_worker where singleton;
select is(max_active_jobs,1,'single-slot safe default') from private.creator_clip_export_worker where singleton;
select is(max_pending_jobs,1000,'bounded pending default') from private.creator_clip_export_worker where singleton;
select is(max_pending_media_ms,900000000::bigint,'pending media work is bounded, not a monetary budget') from private.creator_clip_export_worker where singleton;
select is((select count(*) from private.creator_clip_export_workers),0::bigint,'migration registers no paid workers');
select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid in
 ('private.creator_clip_export_worker'::regclass,'private.creator_clip_export_workers'::regclass,
  'private.creator_clip_export_jobs'::regclass,'private.creator_clip_export_fairness'::regclass,
  'private.creator_clip_export_worker_sessions'::regclass,'private.creator_clip_scale_ledger'::regclass)),
 'all pool state is FORCE RLS protected');
select is((select count(*) from (values('anon'),('authenticated'),('service_role')) roles(role_name)
 cross join (values('private.creator_clip_export_worker'),('private.creator_clip_export_workers'),
  ('private.creator_clip_export_jobs'),('private.creator_clip_export_fairness'),
  ('private.creator_clip_export_worker_sessions'),('private.creator_clip_scale_ledger')) tables(table_name)
 where has_table_privilege(role_name,table_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')),0::bigint,
 'API roles cannot read or mutate private capacity and identity state');
select throws_ok($$update private.creator_clip_export_worker set max_active_jobs=33$$,'23514',null,'global hard maximum is 32');
select throws_ok($$update private.creator_clip_export_worker set max_active_jobs=0$$,'23514',null,'global capacity cannot bypass one-slot minimum');
select throws_ok($$update private.creator_clip_export_worker set max_pending_jobs=100001$$,'23514',null,'queue hard maximum cannot be exceeded');
select throws_ok($$insert into private.creator_clip_export_workers(id,capacity,qualification_note) values(gen_random_uuid(),9,'fixture')$$,'23514',null,'worker hard maximum is eight');
select throws_ok($$insert into private.creator_clip_export_workers(id,qualification_note) values(gen_random_uuid(),'')$$,'23514',null,'operator qualification record required');
select ok(not has_function_privilege('authenticated','public.claim_creator_clip_export(uuid,uuid)','EXECUTE'),'creator cannot claim worker capacity');
select ok(not has_function_privilege('anon','public.open_creator_clip_export_worker(uuid,uuid)','EXECUTE'),'anonymous caller cannot register a session');
select ok(not has_function_privilege('authenticated','public.read_creator_clip_export_pool_metrics()','EXECUTE'),'metrics remain private');
select ok(has_function_privilege('service_role','public.claim_creator_clip_export(uuid,uuid)','EXECUTE'),'existing trusted service auth can claim registered capacity');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(public.claim_creator_clip_export(),null::jsonb,'old unregistered scheduler is fail closed');
select is(public.open_creator_clip_export_worker(gen_random_uuid(),gen_random_uuid()),'{"accepted":false}'::jsonb,'caller cannot self-register a worker');

-- Presentation of a historical completion must not advertise a deleted draft.
create temporary table missing_clip_output_status on commit drop as
 select private.clip_export_safe_status(jsonb_populate_record(null::private.creator_clip_export_jobs,
  jsonb_build_object('id',gen_random_uuid(),'owner_id',gen_random_uuid()::text,
   'status','ready','output_video_id',gen_random_uuid()))) as result;
select is(result->>'status','stale','missing completed draft is unavailable, not ready') from missing_clip_output_status;
select is(result->>'errorCode','output_unavailable','missing draft has a distinct lifecycle reason') from missing_clip_output_status;
select is(result->'outputVideoId','null'::jsonb,'missing draft does not advertise a review target') from missing_clip_output_status;

select * from finish();
rollback;
