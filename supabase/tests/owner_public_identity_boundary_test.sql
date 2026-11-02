begin;
select plan(10);

select has_function('public','read_public_channel_profile',array['text'],'public Profile identity contract remains available');
select has_function('public','read_public_platform_identity',array['text'],'public Platform identity contract remains available');
select ok(not has_function_privilege('anon','public.read_public_channel_profile_pre_owner_boundary(text)','EXECUTE'),'anonymous cannot bypass Profile wrapper');
select ok(not has_function_privilege('authenticated','public.read_public_channel_profile_pre_owner_boundary(text)','EXECUTE'),'member cannot bypass Profile wrapper');
select ok(not has_function_privilege('service_role','public.read_public_channel_profile_pre_owner_boundary(text)','EXECUTE'),'predecessor Profile reader is internal only');
select ok(not has_function_privilege('anon','public.read_public_platform_identity_pre_owner_boundary(text)','EXECUTE'),'anonymous cannot bypass Platform wrapper');
select ok(not has_function_privilege('authenticated','public.read_public_platform_identity_pre_owner_boundary(text)','EXECUTE'),'member cannot bypass Platform wrapper');
select ok(not has_function_privilege('service_role','public.read_public_platform_identity_pre_owner_boundary(text)','EXECUTE'),'predecessor Platform reader is internal only');
select ok(has_function_privilege('anon','public.read_public_channel_profile(text)','EXECUTE'),'ordinary anonymous Profile API grant is preserved');
select ok(has_function_privilege('anon','public.read_public_platform_identity(text)','EXECUTE'),'ordinary anonymous Platform API grant is preserved');

select * from finish();
rollback;
