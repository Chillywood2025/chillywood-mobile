-- Close this transaction's temporary capability. Original memberships survive.
reset role;
revoke create on schema public from sbx_v1_core_owner;
grant sbx_v1_core_owner to postgres with inherit false,set false;
do $$begin
 if has_schema_privilege('sbx_v1_core_owner','public','CREATE')
  or exists(select 1 from pg_auth_members where member='postgres'::regrole
   and roleid='sbx_v1_core_owner'::regrole and (set_option or inherit_option))
  or has_function_privilege('service_role','public.isolated_paid_video_worker_v1(text,uuid,uuid,text,text)','EXECUTE')
  or has_function_privilege('sbx_v1_operator','sandbox_commerce_v1.paid_video_moderate(uuid,text,text)','EXECUTE')
  or not has_function_privilege('service_role','public.isolated_paid_video_operations_v1(text,text)','EXECUTE')
  or has_function_privilege('authenticated','public.isolated_paid_video_operations_v1(text,text)','EXECUTE')
  or not has_function_privilege('authenticated','public.isolated_paid_video_review_v1(text,text)','EXECUTE')
  or has_function_privilege('service_role','public.isolated_paid_video_review_v1(text,text)','EXECUTE')
 then raise exception 'authoring_forward_permissions_not_finalized';end if;
end $$;
