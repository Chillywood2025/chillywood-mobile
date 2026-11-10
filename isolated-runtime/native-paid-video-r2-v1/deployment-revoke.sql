reset role;
revoke create on schema public from sbx_v1_core_owner;
grant sbx_v1_core_owner to postgres with inherit false,set false;
do $$begin
 if has_schema_privilege('sbx_v1_core_owner','public','CREATE')
 or exists(select 1 from pg_auth_members where member='postgres'::regrole and roleid='sbx_v1_core_owner'::regrole and (set_option or inherit_option))
 or (select count(*)<>2 or not bool_and(not rolcanlogin and not rolsuper and not rolcreatedb and not rolcreaterole and not rolreplication and not rolbypassrls and not rolinherit) from pg_roles where rolname in('sbx_v1_r2_gateway','sbx_v1_r2_scanner'))
 or exists(select 1 from pg_auth_members where roleid in('sbx_v1_r2_gateway'::regrole,'sbx_v1_r2_scanner'::regrole) and (member<>'postgres'::regrole or set_option or inherit_option))
 or has_function_privilege('service_role','public.native_paid_video_r2_gateway_v1(jsonb,text,jsonb)','EXECUTE')
 or has_function_privilege('service_role','public.native_paid_video_r2_worker_v1(text,uuid,uuid,text,text)','EXECUTE')
 or not has_function_privilege('sbx_v1_r2_gateway','public.native_paid_video_r2_gateway_v1(jsonb,text,jsonb)','EXECUTE')
 or not has_function_privilege('sbx_v1_r2_scanner','public.native_paid_video_r2_worker_v1(text,uuid,uuid,text,text)','EXECUTE')
 then raise exception 'r2_forward_permissions_not_finalized';end if;
end $$;
