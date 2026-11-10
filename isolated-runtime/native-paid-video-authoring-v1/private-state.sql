-- Forward-only observation capability, not table access or runtime authority.
do $$begin
 if current_user<>'postgres' or session_user<>'postgres' or current_setting('transaction_read_only')<>'off'
  or not exists(select 1 from pg_roles where rolname='supabase_read_only_user' and not rolsuper and not rolcreaterole and not rolcreatedb and not rolreplication)
  or to_regclass('sandbox_commerce_v1.paid_video_native_authoring_profiles') is null or to_regclass('sandbox_commerce_v1.paid_video_native_catalog_templates') is null or to_regclass('sandbox_commerce_v1.paid_video_native_template_retirements') is null or to_regclass('sandbox_commerce_v1.paid_video_native_publications') is null or to_regclass('sandbox_commerce_v1.paid_video_operations_config') is null or to_regclass('sandbox_commerce_v1.paid_video_operations_requests') is null or to_regclass('sandbox_commerce_v1.paid_video_reviewers') is null or to_regclass('sandbox_commerce_v1.paid_video_reviews') is null or to_regclass('sandbox_commerce_v1.paid_video_removals') is null
 then raise exception 'authoring_private_reader_prerequisites_required';end if;
 if has_schema_privilege('sbx_v1_core_owner','public','CREATE')
  or exists(select 1 from pg_auth_members where member='postgres'::regrole and roleid='sbx_v1_core_owner'::regrole and (set_option or inherit_option))
 then raise exception 'authoring_private_owner_interval_required';end if;
end $$;
grant sbx_v1_core_owner to postgres with inherit false,set true;
grant create on schema public to sbx_v1_core_owner;
set local role sbx_v1_core_owner;
create function public.native_paid_video_authoring_private_state_v1() returns jsonb
language plpgsql stable security definer set search_path='' as $$declare bindings jsonb;begin
 if session_user<>'supabase_read_only_user' or current_user<>'sbx_v1_core_owner'
  or current_setting('transaction_read_only')<>'on' or current_setting('transaction_isolation')<>'repeatable read'
  or current_setting('statement_timeout')::interval not between interval '1 microsecond' and interval '5 seconds'
  or current_setting('transaction_timeout')::interval not between interval '1 microsecond' and interval '5 seconds'
  or exists(select 1 from pg_catalog.pg_roles where rolname=session_user and (rolsuper or rolcreaterole or rolcreatedb or rolreplication))
 then raise exception 'authoring_private_read_context_required' using errcode='42501';end if;
 -- Bound complete input inventories BEFORE aggregating definition hashes. The
 -- extra row is a rejection sentinel, never an accepted truncated inventory.
 with profiles as materialized(select configuration_digest,route_id,worker_id,verifier_id,qualification_sha256,enabled from sandbox_commerce_v1.paid_video_native_authoring_profiles limit 2),
 templates as materialized(select id,revision,catalog_id,store,project_id,app_id,wire_product_id,qualification_sha256,enabled from sandbox_commerce_v1.paid_video_native_catalog_templates limit 65),
 retirements as materialized(select template_id,template_revision,reason from sandbox_commerce_v1.paid_video_native_template_retirements limit 65),
 operations as materialized(select binding from sandbox_commerce_v1.paid_video_operations_config limit 2),
 bounds as materialized(select (select count(*)<=1 from profiles) and (select count(*)<=64 from templates)
  and (select count(*)<=64 and coalesce(bool_and(octet_length(reason)<=4096),true) from retirements)
  and (select count(*)<=1 and coalesce(bool_and(octet_length(binding::text)<=16384),true) from operations) ok),
 profile_hashes as materialized(select encode(sha256(convert_to((to_jsonb(p)-'enabled')::text,'UTF8')),'hex') h from profiles p where (select ok from bounds)),
 template_hashes as materialized(select id,revision,enabled,encode(sha256(convert_to((to_jsonb(t)-'enabled')::text,'UTF8')),'hex') h,
  exists(select 1 from retirements r where r.template_id=t.id and r.template_revision=t.revision) retired from templates t where (select ok from bounds)),
 retirement_hashes as materialized(select encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') h from retirements r where (select ok from bounds))
 select jsonb_build_object('withinBounds',b.ok,
  'profileCount',(select count(*) from profiles),'templateCount',(select count(*) from templates),
  'retirementCount',(select count(*) from retirements),'operationsCount',(select count(*) from operations),
  'profileDefinitionsSha256',case when b.ok then (select encode(sha256(convert_to(coalesce(string_agg(h,'' order by h collate "C"),''),'UTF8')),'hex') from profile_hashes) end,
  'templateDefinitionsSha256',case when b.ok then (select encode(sha256(convert_to(coalesce(string_agg(h,'' order by h collate "C"),''),'UTF8')),'hex') from template_hashes) end,
  'templateAvailabilitySha256',case when b.ok then (select encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(jsonb_build_array(h,enabled,retired)::text,'UTF8')),'hex'),'' order by h collate "C"),''),'UTF8')),'hex') from template_hashes) end,
  'templateRetirementsSha256',case when b.ok then (select encode(sha256(convert_to(coalesce(string_agg(h,'' order by h collate "C"),''),'UTF8')),'hex') from retirement_hashes) end,
  'operationsBindingSha256',case when b.ok then (select encode(sha256(convert_to(binding::text,'UTF8')),'hex') from operations) end,
  'profileMatchesGateway',b.ok and exists(select 1 from profiles p join sandbox_commerce_v1.paid_video_gateway_controls c on c.singleton
   where row(p.route_id,p.worker_id,p.verifier_id,p.qualification_sha256) is not distinct from row(c.route_id,c.worker_id,c.verifier_id,c.qualification_sha256))) into bindings from bounds b;
 return jsonb_build_object('protocol','native-paid-video-authoring-private-state-v1','reader',session_user,'transactionReadOnly',true,
  'authoringEnabled',exists(select 1 from sandbox_commerce_v1.paid_video_native_authoring_profiles where enabled limit 1),
  'templatesEnabled',exists(select 1 from sandbox_commerce_v1.paid_video_native_catalog_templates where enabled limit 1),
  'operationsEnabled',exists(select 1 from sandbox_commerce_v1.paid_video_operations_config where enabled limit 1),
  'reviewersActive',exists(select 1 from sandbox_commerce_v1.paid_video_reviewers where active limit 1),
  'bindings',bindings,'empty',jsonb_build_object('paid_video_native_authoring_profiles',not exists(select 1 from sandbox_commerce_v1.paid_video_native_authoring_profiles limit 1),'paid_video_native_catalog_templates',not exists(select 1 from sandbox_commerce_v1.paid_video_native_catalog_templates limit 1),'paid_video_native_template_retirements',not exists(select 1 from sandbox_commerce_v1.paid_video_native_template_retirements limit 1),'paid_video_native_publications',not exists(select 1 from sandbox_commerce_v1.paid_video_native_publications limit 1),'paid_video_operations_config',not exists(select 1 from sandbox_commerce_v1.paid_video_operations_config limit 1),'paid_video_operations_requests',not exists(select 1 from sandbox_commerce_v1.paid_video_operations_requests limit 1),'paid_video_reviewers',not exists(select 1 from sandbox_commerce_v1.paid_video_reviewers limit 1),'paid_video_reviews',not exists(select 1 from sandbox_commerce_v1.paid_video_reviews limit 1),'paid_video_removals',not exists(select 1 from sandbox_commerce_v1.paid_video_removals limit 1)));
end $$;
revoke all on function public.native_paid_video_authoring_private_state_v1() from public,anon,authenticated,service_role,postgres;
grant execute on function public.native_paid_video_authoring_private_state_v1() to supabase_read_only_user;
reset role;
revoke create on schema public from sbx_v1_core_owner;
grant sbx_v1_core_owner to postgres with inherit false,set false;
do $$begin
 if has_schema_privilege('sbx_v1_core_owner','public','CREATE')
  or exists(select 1 from pg_auth_members where member='postgres'::regrole and roleid='sbx_v1_core_owner'::regrole and (set_option or inherit_option))
  or (select count(*)<>2 or bool_or(a.grantee not in('sbx_v1_core_owner'::regrole,'supabase_read_only_user'::regrole)
    or a.grantor<>'sbx_v1_core_owner'::regrole or a.privilege_type<>'EXECUTE' or a.is_grantable)
   from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   where p.oid='public.native_paid_video_authoring_private_state_v1()'::regprocedure)
 then raise exception 'authoring_private_reader_finalization_required';end if;
end $$;
